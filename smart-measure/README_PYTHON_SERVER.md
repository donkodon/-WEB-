# Python Background Removal Server

## 📁 Server: withoutbg-server.py

**Deployment:** Hugging Face Space  
**URL:** https://jinkedon-withoutbg-api.hf.space

This is the ONLY Python background removal server currently in use.

## Architecture

```
User Request
    ↓
[Hono Backend]
    ↓
    ├─→ [Cloudflare AI Workers] (PRIMARY)
    │   └─ @cf/bria/rmbg-2.0
    │   └─ Free, fast, scalable
    │
    └─→ [withoutBG Server] (FALLBACK)
        └─ Hugging Face Space
        └─ https://jinkedon-withoutbg-api.hf.space
```

## ⚠️ Note

- ~~bg-removal-server-v2.py~~ - **REMOVED** (unused, localhost-only)
- ~~bg-removal-server.py~~ - **REMOVED** (old version)

## Configuration

### Environment Variables

Create a `.env` file (copy from `.env.example`):

```bash
cp .env.example .env
```

Edit `.env`:

```bash
# Port (default: 8000)
PORT=8000

# CORS Allowed Origins (comma-separated)
ALLOWED_ORIGINS=https://smart-measure.pages.dev,http://localhost:3000
```

### Security: CORS Configuration

**✅ Production (Specific Domains):**
```bash
ALLOWED_ORIGINS=https://smart-measure.pages.dev,https://yourdomain.com
```

**❌ NEVER in Production:**
```bash
ALLOWED_ORIGINS=*  # Wildcard - INSECURE!
```

**🔧 Development (All Origins):**
```bash
ALLOWED_ORIGINS=*  # Only for local development
```

## Installation

### Requirements

```bash
pip install fastapi uvicorn rembg httpx pillow python-multipart
```

Or use requirements.txt:

```bash
pip install -r requirements.txt
```

### Models

The server supports multiple rembg models:

- **u2netp** (default) - Good balance of speed and quality
- **silueta** - Lighter, faster, lower memory usage
- **u2net** - Higher quality, slower
- **birefnet-general** - High quality, requires more resources

## Usage

### Start Server

**Production (with environment variables):**
```bash
python3 bg-removal-server-v2.py
```

**Development (custom port):**
```bash
PORT=8001 python3 bg-removal-server-v2.py
```

**Development (all origins):**
```bash
ALLOWED_ORIGINS=* python3 bg-removal-server-v2.py
```

### API Endpoints

#### 1. Health Check
```bash
curl http://localhost:8000/
```

Response:
```json
{
  "service": "Background Removal API (Cloudflare AI Fallback)",
  "status": "healthy",
  "models": ["silueta", "u2netp"],
  "version": "2.1.0",
  "primary_service": "Cloudflare AI Workers (@cf/bria/rmbg-2.0)",
  "role": "fallback"
}
```

#### 2. Remove Background (File Upload)
```bash
curl -X POST http://localhost:8000/api/remove-bg \
  -F "file=@image.jpg" \
  -F "model=u2netp" \
  -o output.png
```

#### 3. Remove Background (URL)
```bash
curl -X POST http://localhost:8000/api/remove-bg-from-url \
  -H "Content-Type: application/json" \
  -d '{"image_url": "https://example.com/image.jpg", "model": "u2netp"}' \
  -o output.png
```

#### 4. Remove Background (Base64)
```bash
curl -X POST http://localhost:8000/api/remove-bg-base64 \
  -H "Content-Type: application/json" \
  -d '{"image_base64": "iVBORw0KGgo...", "model": "u2netp"}' \
  -o output.png
```

## Deployment

### Recommended: Don't Deploy This Server

Since Cloudflare AI Workers is the primary service, this Python server is rarely needed. Only deploy if:

1. You need specific rembg models not available in Cloudflare AI
2. You have very high volume that exceeds Cloudflare AI limits
3. You need offline/local background removal

### If You Must Deploy

**Docker:**
```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY bg-removal-server-v2.py .
COPY .env .

ENV PORT=8000
EXPOSE 8000

CMD ["python3", "bg-removal-server-v2.py"]
```

**Build and Run:**
```bash
docker build -t bg-removal-server .
docker run -p 8000:8000 --env-file .env bg-removal-server
```

## Security Checklist

- [ ] Set `ALLOWED_ORIGINS` to specific domains (no wildcard `*`)
- [ ] Use HTTPS in production
- [ ] Set maximum file size limit (default: 10MB)
- [ ] Monitor server logs for suspicious activity
- [ ] Keep dependencies updated (`pip install -U rembg fastapi`)

## Troubleshooting

### CORS Errors

**Error:** `Access to fetch has been blocked by CORS policy`

**Solution:** Add your domain to `ALLOWED_ORIGINS`:
```bash
ALLOWED_ORIGINS=https://yourdomain.com,http://localhost:3000
```

### Model Loading Slow

**Solution:** Use lighter model (silueta):
```bash
curl -X POST http://localhost:8000/api/remove-bg \
  -F "file=@image.jpg" \
  -F "model=silueta"
```

### Out of Memory

**Solution:** 
1. Use lighter model (silueta)
2. Reduce image size before upload
3. Increase server memory allocation

## Removed Files

- ❌ `withoutbg-server.py` - Duplicate functionality, unused
- ❌ `bg-removal-server.py` - Old version, replaced by v2

## Migration from v1

**Old (v1):**
```python
# bg-removal-server.py
allow_origins=["*"]  # Insecure
```

**New (v2):**
```python
# bg-removal-server-v2.py
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "https://smart-measure.pages.dev")
allow_origins=ALLOWED_ORIGINS  # Secure, configurable
```

## Performance

| Model | Speed | Memory | Quality |
|-------|-------|--------|---------|
| silueta | Fast | Low | Good |
| u2netp | Medium | Medium | Better |
| u2net | Slow | High | Best |

**Recommendation:** Use `silueta` for production (low memory, fast).

## License

Same as parent project (SmartMeasure).
