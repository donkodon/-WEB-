# 背景削除機能 (Background Removal) - rembg統合

## 概要

SmartMeasureアプリに **rembg** を使った背景削除（白抜き）機能を統合しました。

### 技術スタック
- **rembg**: オープンソース背景削除ライブラリ (MIT License)
- **モデル**: isnet-general-use（高速・高精度）
- **Python FastAPI**: 背景削除APIサーバー
- **Hono**: バックエンドAPI統合

---

## アーキテクチャ

```
┌─────────────┐
│  Frontend   │  ユーザーが「白抜き」ボタンをクリック
│  (Browser)  │
└──────┬──────┘
       │ POST /api/remove-bg-image/:id
       ▼
┌─────────────┐
│    Hono     │  画像URLを取得、Python APIを呼び出し
│  (Backend)  │
└──────┬──────┘
       │ POST http://localhost:8000/api/remove-bg-from-url
       ▼
┌─────────────┐
│   rembg     │  背景削除処理 (isnet-general-use model)
│ Python API  │
└──────┬──────┘
       │ 返却: PNG (透過背景)
       ▼
┌─────────────┐
│ D1 Database │  processed_urlに保存、status='completed'
└─────────────┘
```

---

## セットアップ

### 1. Python環境のセットアップ

#### オプションA: スクリプトで自動インストール
```bash
cd /home/user/webapp/smart-measure
./start-bg-removal.sh
```

#### オプションB: 手動インストール
```bash
# rembgとFastAPIをインストール
pip3 install rembg[gpu] fastapi uvicorn[standard] python-multipart pillow httpx

# サーバー起動
python3 bg-removal-server.py
```

### 2. Dockerを使う場合（推奨）
```bash
cd /home/user/webapp/smart-measure

# ビルド
docker-compose build

# 起動
docker-compose up -d

# ログ確認
docker-compose logs -f bg-removal

# 停止
docker-compose down
```

### 3. Honoアプリケーションの起動
```bash
cd /home/user/webapp/smart-measure

# ビルド
npm run build

# 開発サーバー起動
pm2 start ecosystem.config.cjs
```

---

## 使い方

### ダッシュボードから使用

1. **個別画像の背景削除**
   - 画像にホバー → 「白抜き」ボタンが表示
   - クリックで即座に処理開始

2. **複数画像の一括処理**
   - 画像のラジオボタンを選択
   - 「選択画像を白抜き」ボタンをクリック

### APIエンドポイント

#### 画像IDで背景削除
```bash
POST /api/remove-bg-image/:imageId
```

レスポンス:
```json
{
  "success": true,
  "imageId": "1",
  "processedUrl": "data:image/png;base64,...",
  "message": "Background removed and saved"
}
```

#### 画像URLから直接背景削除
```bash
POST /api/remove-bg
Content-Type: multipart/form-data

imageUrl=https://example.com/image.jpg
```

---

## Python APIサーバー詳細

### エンドポイント

#### 1. ヘルスチェック
```bash
GET http://localhost:8000/health
```

#### 2. ファイルアップロードで背景削除
```bash
POST http://localhost:8000/api/remove-bg
Content-Type: multipart/form-data

file: <image file>
```

#### 3. URLから背景削除
```bash
POST http://localhost:8000/api/remove-bg-from-url?image_url=https://example.com/image.jpg
```

---

## トラブルシューティング

### Python APIサーバーが起動しない

**確認事項:**
1. Pythonがインストールされているか
   ```bash
   python3 --version
   ```

2. 必要なパッケージがインストールされているか
   ```bash
   pip3 list | grep rembg
   ```

3. ポート8000が使用されていないか
   ```bash
   lsof -i :8000
   ```

### 処理が遅い

**対策:**
1. GPUが利用可能な場合、GPU版を使用
   ```bash
   pip3 install rembg[gpu]
   ```

2. より軽量なモデルに変更
   ```python
   # bg-removal-server.py の session を変更
   session = new_session("u2netp")  # 軽量版
   ```

### 画像が保存されない

**確認事項:**
1. D1データベースが正しく初期化されているか
   ```bash
   curl http://localhost:3000/init
   ```

2. Python APIサーバーが稼働しているか
   ```bash
   curl http://localhost:8000/health
   ```

---

## パフォーマンス

### 処理時間（目安）
- **小画像 (400x400)**: 1-2秒
- **中画像 (1200x1200)**: 3-5秒
- **大画像 (2400x2400)**: 5-10秒

### リソース使用量
- **メモリ**: 約1-2GB
- **CPU**: 中程度（GPU使用時は軽減）

---

## ライセンス

- **rembg**: MIT License ✅ 商用利用可能
- **モデル (isnet-general-use)**: 商用利用可能

---

## 今後の拡張案

1. **R2ストレージ統合**
   - Base64ではなくCloudflare R2に画像を保存

2. **バッチ処理の最適化**
   - 並列処理で複数画像を同時処理

3. **プログレスバー**
   - リアルタイムで処理状況を表示

4. **モデル切り替え**
   - ユーザーがモデルを選択可能に

5. **自動白抜き**
   - 画像アップロード時に自動で背景削除

---

## サポート

問題が発生した場合:
1. ログを確認: `docker-compose logs -f bg-removal`
2. Pythonサーバーのログ: `python3 bg-removal-server.py`の出力
3. ブラウザのコンソール: F12 → Console タブ
