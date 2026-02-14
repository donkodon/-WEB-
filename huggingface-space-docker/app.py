from flask import Flask, request, jsonify
from flask_cors import CORS
import base64
import io
from PIL import Image
import requests
import logging
import asyncio

# Import the withoutBG library (correct way from Qiita article)
from withoutbg.core import WithoutBGOpenSource
from huggingface_hub import hf_hub_download
from pathlib import Path
import shutil

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# Model directory
MODEL_DIR = Path("/app/models")
MODEL_DIR.mkdir(parents=True, exist_ok=True)

def _ensure_model_file(filename: str) -> Path:
    """Download model file from HuggingFace if not exists"""
    target = MODEL_DIR / filename
    if target.exists():
        return target
    logger.info(f"📥 Downloading model file: {filename}")
    downloaded = Path(hf_hub_download(repo_id="withoutbg/focus", filename=filename))
    shutil.copy2(downloaded, target)
    logger.info(f"✅ Model file downloaded: {filename}")
    return target

def _create_model() -> WithoutBGOpenSource:
    """Create WithoutBG model instance"""
    logger.info("🚀 Creating WithoutBG model...")
    return WithoutBGOpenSource(
        depth_model_path=_ensure_model_file("depth_anything_v2_vits_slim.onnx"),
        isnet_model_path=_ensure_model_file("isnet.onnx"),
        matting_model_path=_ensure_model_file("focus_matting_1.0.0.onnx"),
        refiner_model_path=_ensure_model_file("focus_refiner_1.0.0.onnx"),
    )

# Initialize the model once at startup
try:
    logger.info("🚀 Loading withoutBG model...")
    model = _create_model()
    logger.info("✅ Model loaded successfully!")
except Exception as e:
    logger.error(f"❌ Failed to load model: {e}")
    model = None

@app.route('/', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'service': 'withoutBG API Server',
        'status': 'healthy' if model else 'unhealthy',
        'model': 'withoutBG Focus v1.0.0',
        'version': '1.0.0',
        'platform': 'Hugging Face Spaces'
    })

@app.route('/api/remove-bg', methods=['POST'])
def remove_background():
    """Remove background from image"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'success': False, 'error': 'No JSON data provided'}), 400
        
        if not model:
            return jsonify({'success': False, 'error': 'Model not initialized'}), 500
        
        # Get image from URL or base64
        if 'image_url' in data:
            # Download image from URL
            logger.info(f"📥 Downloading image from URL: {data['image_url']}")
            response = requests.get(data['image_url'], timeout=30)
            response.raise_for_status()
            image_data = io.BytesIO(response.content)
            
        elif 'image_base64' in data:
            # Decode base64 image
            logger.info("📥 Decoding base64 image")
            image_base64 = data['image_base64']
            if ',' in image_base64:
                image_base64 = image_base64.split(',')[1]
            image_data = io.BytesIO(base64.b64decode(image_base64))
            
        else:
            return jsonify({
                'success': False,
                'error': 'Either image_url or image_base64 is required'
            }), 400
        
        # Open image
        img = Image.open(image_data)
        logger.info(f"🖼️ Image loaded: {img.size}, mode: {img.mode}")
        
        # Remove background using withoutBG (Qiita article method)
        logger.info("🔄 Removing background with WithoutBGOpenSource...")
        result = model.remove_background(img)
        logger.info(f"✅ Background removed! Result mode: {result.mode}, Size: {result.size}")
        
        # Convert to RGBA first if not already
        if result.mode != 'RGBA':
            result = result.convert('RGBA')
            logger.info(f"🔄 Converted to RGBA mode")
        
        # Create white background and composite
        logger.info("🎨 Creating white background composite...")
        white_bg = Image.new('RGBA', result.size, (255, 255, 255, 255))
        
        # Composite the image onto white background
        output = Image.alpha_composite(white_bg, result)
        
        # Convert to RGB (remove alpha channel)
        result = output.convert('RGB')
        logger.info(f"✅ Final image mode: {result.mode}")
        
        # Convert to PNG bytes
        output_buffer = io.BytesIO()
        result.save(output_buffer, format='PNG')
        output_buffer.seek(0)
        
        # Encode as base64
        image_base64 = base64.b64encode(output_buffer.read()).decode('utf-8')
        
        return jsonify({
            'success': True,
            'image_data': f'data:image/png;base64,{image_base64}'
        })
        
    except Exception as e:
        logger.error(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    import os
    port = int(os.environ.get('PORT', 7860))
    logger.info(f"🚀 Starting withoutBG API Server on port {port}...")
    app.run(host='0.0.0.0', port=port, debug=False)
