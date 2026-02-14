#!/usr/bin/env python3
"""
withoutBG Background Removal API Server
High-quality background removal service using withoutBG Focus model

DEPLOYMENT: Hugging Face Space (https://jinkedon-withoutbg-api.hf.space)
"""

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import Response, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from withoutbg import WithoutBG
from PIL import Image
from io import BytesIO
import logging
import httpx
import base64
import os
from pydantic import BaseModel
from typing import Optional, List

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="withoutBG API Server",
    description="withoutBG Focus-powered background removal service",
    version="1.1.0"
)

# ✅ SECURE CORS Configuration
# Environment variable to control CORS origins
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    # Default to production domains (comma-separated)
    "https://smart-measure.pages.dev,"
    "https://smart-measure-production.pages.dev,"
    "http://localhost:3000,"
    "http://127.0.0.1:3000"
).split(",")

# Clean up whitespace
ALLOWED_ORIGINS = [origin.strip() for origin in ALLOWED_ORIGINS if origin.strip()]

logger.info(f"🔒 CORS allowed origins: {ALLOWED_ORIGINS}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,  # ✅ Specific domains only (no wildcard)
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],  # Only required methods
    allow_headers=["Content-Type", "Authorization"],  # Only required headers
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
        "version": "1.1.0",
        "deployment": "Hugging Face Space",
        "allowed_origins": ALLOWED_ORIGINS
    }


@app.get("/health")
async def health():
    """Health check for monitoring"""
    return {
        "status": "ok",
        "model_loaded": model is not None,
        "allowed_origins": ALLOWED_ORIGINS
    }


@app.post("/api/remove-bg")
async def remove_background(
    file: UploadFile = File(...),
    return_mask: bool = False
):
    """
    Remove background from uploaded image
    
    Args:
        file: Uploaded image file (JPEG, PNG, etc.)
        return_mask: If True, also return mask image
    
    Returns:
        JSON with base64-encoded image data and optionally mask data
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
        
        # Convert PIL Image to base64 data URL
        output_buffer = BytesIO()
        output_image.save(output_buffer, format="PNG")
        output_bytes = output_buffer.getvalue()
        image_base64 = base64.b64encode(output_bytes).decode('utf-8')
        image_data_url = f"data:image/png;base64,{image_base64}"
        
        response_data = {
            "success": True,
            "image_data": image_data_url
        }
        
        # Generate mask if requested
        if return_mask:
            # Extract alpha channel as mask
            if output_image.mode == 'RGBA':
                mask = output_image.split()[3]  # Alpha channel
                mask_buffer = BytesIO()
                mask.save(mask_buffer, format="PNG")
                mask_bytes = mask_buffer.getvalue()
                mask_base64 = base64.b64encode(mask_bytes).decode('utf-8')
                response_data["mask_data"] = f"data:image/png;base64,{mask_base64}"
                logger.info("🎭 Mask generated successfully")
        
        return JSONResponse(content=response_data)
        
    except Exception as e:
        logger.error(f"❌ Error processing image: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")


class ImageUrlRequest(BaseModel):
    image_url: str
    bgcolor: Optional[List[int]] = None  # [R, G, B, A] e.g., [255, 255, 255, 255] for white
    return_mask: bool = False  # Return mask image along with processed image


class ImageBase64Request(BaseModel):
    image_base64: str
    bgcolor: Optional[List[int]] = None  # [R, G, B, A]
    return_mask: bool = False


@app.post("/api/remove-bg-from-url")
async def remove_background_from_url(request: ImageUrlRequest):
    """
    Remove background from image URL
    
    Args:
        request: JSON body with image_url, optional bgcolor, and return_mask
    
    Returns:
        JSON with image_data (base64 data URL) and optionally mask_data
    """
    try:
        image_url = request.image_url
        logger.info(f"📥 Fetching image from URL: {image_url}")
        
        # Fetch image from URL
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(image_url)
            response.raise_for_status()
            input_data = response.content
        
        # Validate file size (max 10MB)
        if len(input_data) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Image too large (max 10MB)")
        
        # Open image with PIL
        image = Image.open(BytesIO(input_data))
        
        # Remove background using withoutBG
        bg_model = get_model()
        logger.info(f"🔄 Removing background with withoutBG Focus...")
        output_image = bg_model.remove_background(image)
        
        response_data = {"success": True}
        
        # Generate mask if requested (before bgcolor compositing)
        if request.return_mask:
            if output_image.mode == 'RGBA':
                mask = output_image.split()[3]  # Alpha channel
                mask_buffer = BytesIO()
                mask.save(mask_buffer, format="PNG")
                mask_bytes = mask_buffer.getvalue()
                mask_base64 = base64.b64encode(mask_bytes).decode('utf-8')
                response_data["mask_data"] = f"data:image/png;base64,{mask_base64}"
                logger.info("🎭 Mask generated successfully")
        
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
        
        # Convert PIL Image to base64 data URL
        output_buffer = BytesIO()
        format_type = "JPEG" if request.bgcolor else "PNG"
        output_image.save(output_buffer, format=format_type, quality=95)
        output_bytes = output_buffer.getvalue()
        image_base64 = base64.b64encode(output_bytes).decode('utf-8')
        
        # Set appropriate media type based on format
        media_type = "jpeg" if request.bgcolor else "png"
        response_data["image_data"] = f"data:image/{media_type};base64,{image_base64}"
        
        return JSONResponse(content=response_data)
        
    except httpx.HTTPError as e:
        logger.error(f"❌ Failed to fetch image from URL: {str(e)}")
        return JSONResponse(
            status_code=400,
            content={"success": False, "error": f"Failed to fetch image: {str(e)}"}
        )
    except Exception as e:
        logger.error(f"❌ Error processing URL: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": f"Processing failed: {str(e)}"}
        )


@app.post("/api/remove-bg-base64")
async def remove_background_from_base64(request: ImageBase64Request):
    """
    Remove background from base64 encoded image
    
    Args:
        request: JSON body with image_base64, optional bgcolor, and return_mask
    
    Returns:
        JSON with image_data (base64 data URL) and optionally mask_data
    """
    try:
        logger.info(f"📥 Processing base64 image (length: {len(request.image_base64)})")
        
        # Handle data URL format (data:image/png;base64,...)
        image_base64_data = request.image_base64
        if image_base64_data.startswith('data:'):
            image_base64_data = image_base64_data.split(',', 1)[1]
        
        # Decode base64 to bytes
        image_bytes = base64.b64decode(image_base64_data)
        
        # Validate file size (max 10MB)
        if len(image_bytes) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Image too large (max 10MB)")
        
        # Open image with PIL
        image = Image.open(BytesIO(image_bytes))
        
        # Remove background using withoutBG
        bg_model = get_model()
        logger.info(f"🔄 Removing background with withoutBG Focus...")
        output_image = bg_model.remove_background(image)
        
        response_data = {"success": True}
        
        # Generate mask if requested (before bgcolor compositing)
        if request.return_mask:
            if output_image.mode == 'RGBA':
                mask = output_image.split()[3]  # Alpha channel
                mask_buffer = BytesIO()
                mask.save(mask_buffer, format="PNG")
                mask_bytes = mask_buffer.getvalue()
                mask_base64 = base64.b64encode(mask_bytes).decode('utf-8')
                response_data["mask_data"] = f"data:image/png;base64,{mask_base64}"
                logger.info("🎭 Mask generated successfully")
        
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
        
        # Convert PIL Image to base64 data URL
        output_buffer = BytesIO()
        format_type = "JPEG" if request.bgcolor else "PNG"
        output_image.save(output_buffer, format=format_type, quality=95)
        output_bytes = output_buffer.getvalue()
        image_base64 = base64.b64encode(output_bytes).decode('utf-8')
        
        # Set appropriate media type based on format
        media_type = "jpeg" if request.bgcolor else "png"
        response_data["image_data"] = f"data:image/{media_type};base64,{image_base64}"
        
        return JSONResponse(content=response_data)
        
    except Exception as e:
        logger.error(f"❌ Error processing base64: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": f"Processing failed: {str(e)}"}
        )


if __name__ == "__main__":
    import uvicorn
    
    # Get port from environment variable (default: 8001)
    port = int(os.getenv("PORT", "8001"))
    
    logger.info("🚀 Starting withoutBG API Server...")
    logger.info(f"📍 Listening on http://0.0.0.0:{port}")
    logger.info("📦 Model: withoutBG Focus v1.0.0 (open source)")
    logger.info(f"🔒 CORS allowed origins: {ALLOWED_ORIGINS}")
    logger.info("🌐 Deployment: Hugging Face Space")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info"
    )
