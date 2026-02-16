import { Hono } from 'hono'
import type { AppEnv } from '../../../types/bindings'
import { getCompanyId } from '../../auth/helpers/auth'
import { requireFirebaseAuth } from '../../auth/middleware/auth'
import { ImageUrlHelper } from '../../image-editor/helpers/image-url'
import { createSafeErrorResponse, ErrorCode, logError } from '../../../shared/helpers/error-handler'
import { logger } from '../../../shared/helpers/logger'

const measurement = new Hono<AppEnv>()

// Apply Firebase authentication to all measurement endpoints
measurement.use('/api/*', requireFirebaseAuth())

measurement.post('/api/auto-measure', async (c) => {
  try {
    const { imageId, imageUrl, sku } = await c.req.json();
    const companyId = getCompanyId(c);
    
    logger.debug(`🔬 Auto-measure request:`, { imageId, imageUrl, sku, companyId });
  
  // 1. Get category from product_master
  const productResult = await c.env.DB.prepare(`
    SELECT category, name 
    FROM product_master 
    WHERE sku = ? AND company_id = ?
  `).bind(sku, companyId).first();
  
  if (!productResult) {
    return c.json({ success: false, error: 'Product not found' }, 404);
  }
  
  const category = productResult.category || '不明';
  // Use environment variable or fallback to default
  const garmentClass = c.env.DEFAULT_GARMENT_CLASS || 'long sleeve top';
  
  // 2. Check if REPLICATE_API_KEY is configured
  if (!c.env.REPLICATE_API_KEY) {
    logger.error('❌ REPLICATE_API_KEY is not configured');
    return c.json({ 
      success: false, 
      error: 'REPLICATE_API_KEY is not configured. Please set it in Cloudflare Pages environment variables.' 
    }, 500);
  }
  
  logger.debug(`📤 Sending to Replicate API: ${imageUrl}, garment_class=${garmentClass}`);
  
  // 3. Create Replicate prediction
  const createResponse = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${c.env.REPLICATE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        version: '6f4a150f6355b07eff5151b7ef49f2bf0b297bd329ee5f17a46e283f0685f926',
        input: {
          image: imageUrl,
          garment_class: garmentClass
        }
      })
    });
    
    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      logger.error(' Replicate API error:', errorText);
      return c.json({ success: false, error: 'Failed to create prediction', details: errorText }, 500);
    }
    
    const prediction = await createResponse.json();
    const predictionId = prediction.id;
    
    logger.debug(`⏳ Prediction created: ${predictionId}`);
    
    // 4. Poll for result (max 180 seconds)
    let result = prediction;
    let attempts = 0;
    const maxAttempts = 90; // 90 × 2s = 180s
    
    while (result.status !== 'succeeded' && result.status !== 'failed' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      
      const statusResponse = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
        headers: {
          'Authorization': `Token ${c.env.REPLICATE_API_KEY}`
        }
      });
      
      result = await statusResponse.json();
      attempts++;
      
      logger.debug(`⏳ Polling (${attempts}/${maxAttempts}): status=${result.status}`);
    }
    
    // 5. Check result
    if (result.status !== 'succeeded') {
      logger.error(' Prediction failed or timed out:', result);
      return c.json({ 
        success: false, 
        error: 'Measurement failed or timed out',
        details: result 
      }, 500);
    }
    
    logger.debug('✅ Measurement succeeded');
    
    // 6. Save to database
    const output = result.output;
    
    // Copy measurement image to R2
    let measurementImageR2Url = output.image;
    if (output.image && c.env.PRODUCT_IMAGES) {
      try {
        logger.debug(`📥 Downloading measurement image from ${output.image}`);
        const imageResponse = await fetch(output.image);
        if (imageResponse.ok) {
          const imageBuffer = await imageResponse.arrayBuffer();
          const measurementImageKey = `${companyId}/${sku}/measurement_${Date.now()}.png`;
          await c.env.PRODUCT_IMAGES.put(measurementImageKey, imageBuffer, {
            httpMetadata: {
              contentType: 'image/png'
            }
          });
          measurementImageR2Url = ImageUrlHelper.toFullUrl(measurementImageKey);
          logger.debug(`✅ Saved measurement image to R2: ${measurementImageR2Url}`);
        }
      } catch (error) {
        logError('Copy measurement image to R2', error);
        // Continue with original URL
      }
    }
    
    // Check if measurement data already exists for this image
    const existingItem = await c.env.DB.prepare(`
      SELECT id, item_code, ai_landmarks
      FROM product_items
      WHERE sku = ?
        AND company_id = ?
        AND json_extract(image_urls, '$[0]') = ?
      LIMIT 1
    `).bind(sku, companyId, imageUrl).first();
    
    if (existingItem) {
      // Update existing measurement data
      await c.env.DB.prepare(`
        UPDATE product_items
        SET ai_landmarks = ?,
            reference_object = ?,
            measurements = ?,
            annotated_image_url = ?,
            measurement_status = ?,
            measurement_category = ?,
            measured_at = ?,
            updated_at = ?
        WHERE id = ?
      `).bind(
        JSON.stringify(output.landmarks),
        JSON.stringify({ pixelPerCm: output.pixel_per_cm }),
        JSON.stringify(output.measurements),
        measurementImageR2Url,
        'auto',
        garmentClass,
        new Date().toISOString(),
        new Date().toISOString(),
        existingItem.id
      ).run();
      
      logger.debug(`🔄 Updated measurement data for existing item: ${existingItem.item_code}`);
      
      return c.json({
        success: true,
        itemCode: existingItem.item_code,
        updated: true,
        measurements: output.measurements,
        annotatedImage: measurementImageR2Url,
        pixelPerCm: output.pixel_per_cm
      });
    }
    
    // Generate item_code for new item
    const itemResult = await c.env.DB.prepare(`
      SELECT item_code 
      FROM product_items 
      WHERE sku = ? 
      ORDER BY created_at DESC 
      LIMIT 1
    `).bind(sku).first();
    
    let itemCode;
    if (itemResult) {
      const baseCode = itemResult.item_code.split('-')[0];
      const nextNumber = parseInt(itemResult.item_code.split('-').pop() || '0') + 1;
      itemCode = `${baseCode}-${String(nextNumber).padStart(3, '0')}`;
    } else {
      itemCode = `${sku}-001`;
    }
    
    // Insert new product_items record
    await c.env.DB.prepare(`
      INSERT INTO product_items (
        sku, 
        item_code, 
        company_id,
        image_urls,
        ai_landmarks, 
        reference_object, 
        measurements, 
        annotated_image_url,
        measurement_status,
        measurement_category,
        measured_at,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      sku,
      itemCode,
      companyId,
      JSON.stringify([imageUrl]),
      JSON.stringify(output.landmarks),
      JSON.stringify({ pixelPerCm: output.pixel_per_cm }),
      JSON.stringify(output.measurements),
      measurementImageR2Url,
      'auto',
      garmentClass,
      new Date().toISOString(),
      new Date().toISOString()
    ).run();
    
    logger.debug(`💾 Created new measurement data: item_code=${itemCode}`);
    
    return c.json({
      success: true,
      itemCode: itemCode,
      updated: false,
      measurements: output.measurements,
      annotatedImage: measurementImageR2Url,
      pixelPerCm: output.pixel_per_cm
    });
    
  } catch (error: any) {
    logError('Auto-measure', error, { imageUrl, sku });
    return c.json(createSafeErrorResponse(error, ErrorCode.EXTERNAL_API_ERROR), 500);
  }
});

measurement.get('/api/measurements/:sku', async (c) => {
  try {
    const sku = c.req.param('sku');
    const companyId = getCompanyId(c);
    
    logger.debug(`📊 Get measurement data: SKU=${sku}, company_id=${companyId}`);
    
    // Get measurement data from product_items
    const result = await c.env.DB.prepare(`
      SELECT 
        id,
        sku,
        item_code,
        image_urls,
        ai_landmarks,
        manual_landmarks,
        reference_object,
        measurements,
        annotated_image_url,
        measurement_image_url,
        measurement_status,
        measurement_category,
        measured_at
      FROM product_items
      WHERE sku = ? AND company_id = ? AND ai_landmarks IS NOT NULL
      ORDER BY measured_at DESC
      LIMIT 1
    `).bind(sku, companyId).first();
    
    if (!result) {
      return c.json({ 
        success: false, 
        error: 'No measurement data found for this SKU' 
      }, 404);
    }
    
    // Parse JSON fields
    const landmarks = result.ai_landmarks ? JSON.parse(result.ai_landmarks as string) : {};
    const manualLandmarks = result.manual_landmarks ? JSON.parse(result.manual_landmarks as string) : null;
    const referenceObject = result.reference_object ? JSON.parse(result.reference_object as string) : {};
    const measurements = result.measurements ? JSON.parse(result.measurements as string) : {};
    const imageUrls = result.image_urls ? JSON.parse(result.image_urls as string) : [];
    
    // Use manual landmarks if available, otherwise use AI landmarks
    const activeLandmarks = manualLandmarks || landmarks;
    
    // Check if measurement image has been processed (white background removed)
    // Priority: measurement_image_url (processed) > annotated_image_url > image_urls[0]
    let displayImageUrl = imageUrls[0] || null;
    
    // If measurement_image_url exists and contains '_p.png', it's the processed version
    if (result.measurement_image_url && (result.measurement_image_url as string).includes('_p.png')) {
      displayImageUrl = result.measurement_image_url as string;
      logger.debug(`✅ Using processed measurement image for SKU ${sku}`);
    } else if (result.annotated_image_url) {
      displayImageUrl = result.annotated_image_url as string;
      logger.debug(`ℹ️ Using annotated image for SKU ${sku}`);
    }
    
    return c.json({
      success: true,
      data: {
        id: result.id,
        sku: result.sku,
        item_code: result.item_code,
        image_url: displayImageUrl,
        annotated_image_url: result.annotated_image_url,
        measurement_image_url: result.measurement_image_url,
        landmarks: activeLandmarks,
        pixel_per_cm: referenceObject.pixelPerCm || 15.0,
        measurements: measurements,
        measurement_status: result.measurement_status,
        measurement_category: result.measurement_category,
        measured_at: result.measured_at
      }
    });
    
  } catch (error: any) {
    logError('Get measurement data', error, { sku });
    return c.json(createSafeErrorResponse(error, ErrorCode.DB_QUERY_FAILED), 500);
  }
});

// ==========================================
// API: Update Manual Landmarks (Phase 2)
// ==========================================
measurement.patch('/api/measurements/:sku', async (c) => {
  try {
    const sku = c.req.param('sku');
    const companyId = getCompanyId(c);
    const { manual_landmarks, measurements } = await c.req.json();
    
    logger.debug(`💾 Update manual landmarks: SKU=${sku}, company_id=${companyId}`);
    
    // Get existing product_items record
    const existing = await c.env.DB.prepare(`
      SELECT id FROM product_items
      WHERE sku = ? AND company_id = ? AND ai_landmarks IS NOT NULL
      ORDER BY measured_at DESC
      LIMIT 1
    `).bind(sku, companyId).first();
    
    if (!existing) {
      return c.json({ 
        success: false, 
        error: 'No measurement data found for this SKU' 
      }, 404);
    }
    
    // Update manual landmarks and measurements
    await c.env.DB.prepare(`
      UPDATE product_items 
      SET manual_landmarks = ?,
          measurements = ?,
          measurement_status = 'manual_adjusted',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      JSON.stringify(manual_landmarks),
      JSON.stringify(measurements),
      existing.id
    ).run();
    
    logger.debug(`✅ Manual landmarks saved: id=${existing.id}`);
    
    return c.json({
      success: true,
      message: 'Landmarks updated successfully'
    });
    
  } catch (error: any) {
    logError('Update landmarks', error, { sku });
    return c.json(createSafeErrorResponse(error, ErrorCode.DB_ERROR), 500);
  }
});

export default measurement
