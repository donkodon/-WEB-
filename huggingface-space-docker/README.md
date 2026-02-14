---
title: withoutBG API
emoji: 🎨
colorFrom: blue
colorTo: green
sdk: docker
pinned: false
license: apache-2.0
---

# 🎨 withoutBG API Server

高精度な背景削除APIサーバー（withoutBG Focus モデル使用）

## API エンドポイント

### Health Check
```bash
GET /
```

### Background Removal
```bash
POST /api/remove-bg
Content-Type: application/json

{
  "image_url": "https://example.com/image.jpg"
}
```

または

```bash
POST /api/remove-bg
Content-Type: application/json

{
  "image_base64": "data:image/jpeg;base64,..."
}
```

## レスポンス

```json
{
  "success": true,
  "image_data": "data:image/png;base64,iVBORw0KG..."
}
```

## 使用モデル

- **withoutBG Focus v1.0.0** (高精度背景削除)
- **License**: Apache 2.0
- **Platform**: Hugging Face Spaces (Docker)
