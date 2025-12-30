#!/usr/bin/env python3
"""Simple test server to verify rembg works"""

from fastapi import FastAPI
import uvicorn

app = FastAPI()

@app.get("/")
def root():
    return {"status": "ok", "message": "Test server running"}

@app.get("/health")
def health():
    return {"status": "healthy"}

@app.get("/test-rembg")
def test_rembg():
    try:
        from rembg import remove
        return {"rembg": "available", "status": "ok"}
    except Exception as e:
        return {"rembg": "error", "error": str(e)}

if __name__ == "__main__":
    print("🚀 Starting test server on port 8000...")
    uvicorn.run(app, host="0.0.0.0", port=8000)
