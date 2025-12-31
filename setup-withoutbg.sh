#!/bin/bash

# withoutBG Server Setup Script
# This script installs withoutBG and its dependencies

set -e

echo "🚀 Starting withoutBG server setup..."

# Check Python version
python3 --version || { echo "❌ Python 3 not found"; exit 1; }

# Install withoutBG and dependencies
echo "📦 Installing withoutBG and dependencies..."
pip3 install withoutbg fastapi uvicorn[standard] python-multipart pillow httpx

echo "✅ withoutBG server setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Start the server: pm2 start ecosystem-withoutbg.config.cjs"
echo "2. Check logs: pm2 logs withoutbg-server"
echo "3. Test: curl http://localhost:8001"
echo ""
echo "⚠️  Note: First run will download ~320MB of models"
