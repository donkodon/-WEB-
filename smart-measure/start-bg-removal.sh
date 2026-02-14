#!/bin/bash
# Background Removal Server Startup Script
# This script starts the rembg API server without Docker

echo "🚀 Starting Background Removal Server..."

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed"
    exit 1
fi

# Check if required packages are installed
if ! python3 -c "import rembg" 2>/dev/null; then
    echo "📦 Installing required packages..."
    pip3 install rembg[gpu] fastapi uvicorn[standard] python-multipart pillow httpx
fi

# Start the server
echo "✅ Starting server on http://0.0.0.0:8000"
python3 bg-removal-server-v2.py
