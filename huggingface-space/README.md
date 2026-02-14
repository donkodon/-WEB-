---
title: Smart Measure Background Removal
emoji: 🎨
colorFrom: blue
colorTo: green
sdk: gradio
sdk_version: 4.44.0
app_file: app.py
pinned: false
license: apache-2.0
---

# Smart Measure Background Removal API

**withoutBG公式ライブラリ**を使用した背景削除APIです。

https://withoutbg.com/ の無料オープンソースモデル（Apache 2.0 License）を使用しています。

## Features

- 画像の背景を自動削除
- 白背景に変換
- URL指定またはBase64入力対応
- API経由でのアクセス可能

## API Usage

### Endpoint

```
POST https://your-space-name.hf.space/api/predict
```

### Request

```json
{
  "data": ["https://example.com/image.jpg"]
}
```

### Response

```json
{
  "data": ["data:image/png;base64,iVBORw0KG..."]
}
```

## Local Development

```bash
pip install -r requirements.txt
python app.py
```

## Model

- **Focus**: withoutBG公式の高精度モデル（最も正確なオープンソースモデル）
- 完全無料（Apache 2.0 License）
- 複雑な髪の毛や細部の処理に優れる
