#!/usr/bin/env python3
"""
withoutBG Background Removal API Server
High-quality background removal service using withoutBG Focus model
"""

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from withoutbg import WithoutBG
from PIL import Image
from io import BytesIO
import logging
import httpx
import base64
from pydantic import BaseModel
from typing import Optional, List

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="withoutBG API Server",
    description="withoutBG Focus-powered background removal service",
    version="1.0.0"
)

# Enable CORS for Hono backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize withoutBG model (lazy loading)
model = None

def get_model():
    """Lazy load withoutBG model on first request"""
    global model
    if model is None:
        logger.info("🔧 Initializing withoutBG Focus model...")
        model = WithoutBG.opensource()
        logger.info("✅ withoutBG Focus model loaded successfully")
    return model


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "service": "withoutBG API Server",
        "status": "healthy",
        "model": "withoutBG Focus v1.0.0",
        "version": "1.0.0"
    }


@app.get("/health")
async def health():
    """Health check for monitoring"""
    return {
        "status": "ok",
        "model_loaded": model is not None
    }


@app.post("/api/remove-bg")
async def remove_background(file: UploadFile = File(...)):
    """
    Remove background from uploaded image
    
    Args:
        file: Uploaded image file (JPEG, PNG, etc.)
    
    Returns:
        PNG image with transparent background
    """
    try:
        logger.info(f"📥 Processing image: {file.filename} ({file.content_type})")
        
        # Read uploaded file
        input_data = await file.read()
        
        # Validate file size (max 10MB)
        if len(input_data) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File too large (max 10MB)")
        
        # Open image with PIL
        image = Image.open(BytesIO(input_data))
        
        # Remove background using withoutBG
        bg_model = get_model()
        logger.info(f"🔄 Removing background with withoutBG Focus...")
        output_image = bg_model.remove_background(image)
        
        logger.info(f"✅ Background removed successfully: {file.filename}")
        
        # Convert PIL Image to bytes
        output_buffer = BytesIO()
        output_image.save(output_buffer, format="PNG")
        output_bytes = output_buffer.getvalue()
        
        # Return PNG with transparent background
        return Response(
            content=output_bytes,
            media_type="image/png",
            headers={
                "Content-Disposition": f'inline; filename="processed_{file.filename}"'
            }
        )
        
    except Exception as e:
        logger.error(f"❌ Error processing image: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")


class ImageUrlRequest(BaseModel):
    image_url: str
    bgcolor: Optional[List[int]] = None  # [R, G, B, A] e.g., [255, 255, 255, 255] for white
    model: str = "withoutbg"  # Placeholder for compatibility


class ImageBase64Request(BaseModel):
    image_base64: str
    bgcolor: Optional[List[int]] = None  # [R, G, B, A]
    model: str = "withoutbg"  # Placeholder for compatibility


@app.post("/api/remove-bg-from-url")
async def remove_background_from_url(request: ImageUrlRequest):
    """
    Remove background from image URL
    
    Args:
        request: JSON body with image_url field
    
    Returns:
        PNG image with transparent background
    """
    try:
        image_url = request.image_url
        logger.info(f"📥 Fetching image from URL: {image_url}")
        
        # Fetch image from URL
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(image_url)
            response.raise_for_status()
            input_data = response.content
        
        # Open image with PIL
        image = Image.open(BytesIO(input_data))
        
        # Remove background using withoutBG
        bg_model = get_model()
        logger.info(f"🔄 Removing background with withoutBG Focus...")
        output_image = bg_model.remove_background(image)
        
        # If bgcolor is provided, composite with background color
        if request.bgcolor and len(request.bgcolor) >= 3:
            # Create a background image with the specified color
            bg_color = tuple(request.bgcolor[:3])  # RGB
            alpha = request.bgcolor[3] if len(request.bgcolor) > 3 else 255
            
            # Convert to RGBA if needed
            if output_image.mode != 'RGBA':
                output_image = output_image.convert('RGBA')
            
            # Create background with specified color
            background = Image.new('RGBA', output_image.size, bg_color + (alpha,))
            
            # Composite: place the transparent foreground on the colored background
            output_image = Image.alpha_composite(background, output_image)
            
            # Convert to RGB since we now have opaque background
            output_image = output_image.convert('RGB')
            logger.info(f"✅ Applied background color: {bg_color}")
        
        logger.info(f"✅ Background removed from URL successfully")
        
        # Convert PIL Image to bytes
        output_buffer = BytesIO()
        format_type = "JPEG" if request.bgcolor else "PNG"
        output_image.save(output_buffer, format=format_type, quality=95)
        output_bytes = output_buffer.getvalue()
        
        # Set appropriate media type based on format
        media_type = "image/jpeg" if request.bgcolor else "image/png"
        return Response(
            content=output_bytes,
            media_type=media_type
        )
        
    except Exception as e:
        logger.error(f"❌ Error processing URL: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")


@app.post("/api/remove-bg-base64")
async def remove_background_from_base64(request: ImageBase64Request):
    """
    Remove background from base64 encoded image
    
    Args:
        request: JSON body with image_base64 field (base64 encoded image data)
    
    Returns:
        PNG image with transparent background
    """
    try:
        logger.info(f"📥 Processing base64 image (length: {len(request.image_base64)})")
        
        # Decode base64 to bytes
        image_bytes = base64.b64decode(request.image_base64)
        
        # Open image with PIL
        image = Image.open(BytesIO(image_bytes))
        
        # Remove background using withoutBG
        bg_model = get_model()
        logger.info(f"🔄 Removing background with withoutBG Focus...")
        output_image = bg_model.remove_background(image)
        
        # If bgcolor is provided, composite with background color
        if request.bgcolor and len(request.bgcolor) >= 3:
            # Create a background image with the specified color
            bg_color = tuple(request.bgcolor[:3])  # RGB
            alpha = request.bgcolor[3] if len(request.bgcolor) > 3 else 255
            
            # Convert to RGBA if needed
            if output_image.mode != 'RGBA':
                output_image = output_image.convert('RGBA')
            
            # Create background with specified color
            background = Image.new('RGBA', output_image.size, bg_color + (alpha,))
            
            # Composite: place the transparent foreground on the colored background
            output_image = Image.alpha_composite(background, output_image)
            
            # Convert to RGB since we now have opaque background
            output_image = output_image.convert('RGB')
            logger.info(f"✅ Applied background color: {bg_color}")
        
        logger.info(f"✅ Background removed from base64 image successfully")
        
        # Convert PIL Image to bytes
        output_buffer = BytesIO()
        format_type = "JPEG" if request.bgcolor else "PNG"
        output_image.save(output_buffer, format=format_type, quality=95)
        output_bytes = output_buffer.getvalue()
        
        # Set appropriate media type based on format
        media_type = "image/jpeg" if request.bgcolor else "image/png"
        return Response(
            content=output_bytes,
            media_type=media_type
        )
        
    except Exception as e:
        logger.error(f"❌ Error processing base64: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    logger.info("🚀 Starting withoutBG API Server...")
    logger.info("📍 Listening on http://0.0.0.0:8001")
    logger.info("📦 Model: withoutBG Focus v1.0.0 (open source)")
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8001,
        log_level="info"
    )
