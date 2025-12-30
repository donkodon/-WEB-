#!/usr/bin/env python3
"""
Background Removal API Server using rembg
Lightweight, fast background removal service for SmartMeasure app
"""

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from rembg import remove, new_session
from PIL import Image
import io
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Background Removal API",
    description="rembg-powered background removal service",
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

# Load rembg session at startup (faster inference)
# Using isnet-general-use model (best balance of speed and quality)
session = new_session("isnet-general-use")
logger.info("✅ rembg session loaded successfully (model: isnet-general-use)")


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "service": "Background Removal API",
        "status": "healthy",
        "model": "isnet-general-use",
        "version": "1.0.0"
    }


@app.get("/health")
async def health():
    """Health check for monitoring"""
    return {"status": "ok", "model": "rembg/isnet-general-use"}


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
        
        # Remove background using rembg
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


@app.post("/api/remove-bg-from-url")
async def remove_background_from_url(image_url: str):
    """
    Remove background from image URL
    
    Args:
        image_url: URL of the image to process
    
    Returns:
        PNG image with transparent background
    """
    try:
        import httpx
        
        logger.info(f"📥 Fetching image from URL: {image_url}")
        
        # Fetch image from URL
        async with httpx.AsyncClient() as client:
            response = await client.get(image_url, timeout=30.0)
            response.raise_for_status()
            input_data = response.content
        
        # Remove background
        output_data = remove(input_data, session=session)
        
        logger.info(f"✅ Background removed from URL successfully")
        
        return Response(
            content=output_data,
            media_type="image/png"
        )
        
    except Exception as e:
        logger.error(f"❌ Error processing URL: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info"
    )
