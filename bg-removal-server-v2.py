#!/usr/bin/env python3
"""
Background Removal API Server using rembg (Lazy Loading Version)
Lightweight, fast background removal service for SmartMeasure app
"""

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from rembg import remove, new_session
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Background Removal API",
    description="rembg-powered background removal service",
    version="2.0.0"
)

# Enable CORS for Hono backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logger.info("✅ FastAPI app initialized (lazy loading mode)")

# Create session for u2netp model (lightweight 4.7MB)
session = None  # Will be initialized on first use


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "service": "Background Removal API",
        "status": "healthy",
        "model": "u2netp (lightweight 4.7MB)",
        "version": "2.0.0",
        "mode": "lazy-loading"
    }


@app.get("/health")
async def health():
    """Health check for monitoring"""
    return {"status": "ok", "model": "u2netp (lightweight)"}


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
        
        # Remove background using rembg with u2netp model (lightweight 4.7MB)
        global session
        if session is None:
            logger.info("🔧 Initializing u2netp model (first use)...")
            session = new_session("u2netp")
        
        logger.info("🔄 Removing background with u2netp (lightweight)...")
        output_data = remove(input_data, session=session)
        
        logger.info(f"✅ Background removed successfully: {file.filename}")
        
        # Return PNG with transparent background
        return Response(
            content=output_data,
            media_type="image/png",
            headers={
                "Content-Disposition": f'inline; filename="processed_{file.filename}"'
            }
        )
        
    except Exception as e:
        logger.error(f"❌ Error processing image: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")


from pydantic import BaseModel
from typing import Optional, List
import base64

class ImageUrlRequest(BaseModel):
    image_url: str
    bgcolor: Optional[List[int]] = None  # [R, G, B, A] e.g., [255, 255, 255, 255] for white

class ImageBase64Request(BaseModel):
    image_base64: str
    bgcolor: Optional[List[int]] = None  # [R, G, B, A]

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
        import httpx
        from PIL import Image
        from io import BytesIO
        
        image_url = request.image_url
        logger.info(f"📥 Fetching image from URL: {image_url}")
        
        # Fetch image from URL
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(image_url)
            response.raise_for_status()
            input_data = response.content
        
        # Open image with PIL to ensure it's valid
        image = Image.open(BytesIO(input_data))
        
        # Remove background using rembg with u2netp model (lightweight 4.7MB)
        global session
        if session is None:
            logger.info("🔧 Initializing u2netp model (first use)...")
            session = new_session("u2netp")
        
        logger.info("🔄 Removing background with u2netp (lightweight)...")
        output_image = remove(image, session=session)
        
        # If bgcolor is provided, composite with background color
        if request.bgcolor and len(request.bgcolor) >= 3:
            from PIL import Image as PILImage
            # Create a background image with the specified color
            bg_color = tuple(request.bgcolor[:3])  # RGB
            alpha = request.bgcolor[3] if len(request.bgcolor) > 3 else 255
            
            # Convert to RGBA if needed
            if output_image.mode != 'RGBA':
                output_image = output_image.convert('RGBA')
            
            # Create background with specified color
            background = PILImage.new('RGBA', output_image.size, bg_color + (alpha,))
            
            # Composite: place the transparent foreground on the colored background
            output_image = PILImage.alpha_composite(background, output_image)
            
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
        from PIL import Image
        from io import BytesIO
        
        logger.info(f"📥 Processing base64 image (length: {len(request.image_base64)})")
        
        # Decode base64 to bytes
        image_bytes = base64.b64decode(request.image_base64)
        
        # Open image with PIL
        image = Image.open(BytesIO(image_bytes))
        
        # Remove background using rembg with u2netp model
        global session
        if session is None:
            logger.info("🔧 Initializing u2netp model (first use)...")
            session = new_session("u2netp")
        
        logger.info("🔄 Removing background with u2netp (lightweight)...")
        output_image = remove(image, session=session)
        
        # If bgcolor is provided, composite with background color
        if request.bgcolor and len(request.bgcolor) >= 3:
            from PIL import Image as PILImage
            # Create a background image with the specified color
            bg_color = tuple(request.bgcolor[:3])  # RGB
            alpha = request.bgcolor[3] if len(request.bgcolor) > 3 else 255
            
            # Convert to RGBA if needed
            if output_image.mode != 'RGBA':
                output_image = output_image.convert('RGBA')
            
            # Create background with specified color
            background = PILImage.new('RGBA', output_image.size, bg_color + (alpha,))
            
            # Composite: place the transparent foreground on the colored background
            output_image = PILImage.alpha_composite(background, output_image)
            
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
    logger.info("🚀 Starting Background Removal API Server...")
    logger.info("📍 Listening on http://0.0.0.0:8000")
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info"
    )
