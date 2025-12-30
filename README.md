# SmartMeasure - 採寸撮影用アプリ

商品撮影・採寸データ管理システム。背景白抜き機能（AI）を搭載し、ECサイトへのCSVデータ連携をサポートします。

## 主な機能

- ✅ 商品画像のアップロード・管理
- ✅ AI背景白抜き処理（2つのモデルから選択可能）
  - **rembg (u2netp)**: セルフホスト版（高速・標準精度）
  - **BRIA RMBG 2.0**: API版（高精度・商用対応）
- ✅ 画像編集機能（明るさ、色味、WB調整）
- ✅ CSV一括インポート・エクスポート
- ✅ 複数画像の一括ダウンロード（ZIP形式）

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

#### ローカル開発環境（`.dev.vars`）

```bash
# .dev.vars ファイルを編集
BRIA_API_KEY=your-fal-api-key-here  # Fal.ai APIキー
BG_REMOVAL_API_URL=http://127.0.0.1:8000  # セルフホストrembgサーバー
```

#### 本番環境（Cloudflare Pages）

```bash
# BRIA APIキーをシークレットとして設定
npx wrangler secret put BRIA_API_KEY

# 環境変数（wrangler.jsonc に既に設定済み）
# BG_REMOVAL_API_URL は不要（本番ではBRIA APIのみ使用）
```

### 3. BRIA RMBG 2.0 APIキーの取得方法

**Fal.ai経由でBRIA RMBG 2.0を使用（推奨）：**

1. https://fal.ai/ にアクセス
2. アカウント作成（GitHubまたはGoogle認証）
3. Dashboard → API Keys で新しいキーを作成
4. 生成されたキーを`.dev.vars`にコピー

**料金：** 約$0.0026/画像（従量課金）

### 4. データベース初期化

```bash
# ローカル開発環境
curl http://localhost:3000/init
```

### 5. 開発サーバー起動

```bash
npm run build
pm2 start ecosystem.config.cjs
```

## 背景削除機能の使い方

### モデルの選択

ダッシュボードの「選択画像を白抜き」ボタンの横にあるドロップダウンから選択：

- **rembg (高速・標準)**: セルフホストPythonサーバーを使用
- **BRIA rmbg2.0 (高精度)**: Fal.ai API経由でBRIA RMBG 2.0を使用

### セルフホスト版（rembg）のセットアップ

BRIA APIキーがない場合や、コストを抑えたい場合は、セルフホスト版を使用できます。

#### Python環境のセットアップ

```bash
# rembgとFastAPIをインストール
pip3 install rembg[gpu] fastapi uvicorn[standard] python-multipart pillow httpx

# サーバー起動
python3 bg-removal-server.py
```

#### Dockerを使う場合（推奨）

```bash
# ビルド
docker-compose build

# 起動
docker-compose up -d

# ログ確認
docker-compose logs -f bg-removal
```

詳細は `BACKGROUND_REMOVAL.md` を参照してください。

## デプロイ

### Cloudflare Pagesへのデプロイ

```bash
# ビルド
npm run build

# デプロイ
npm run deploy
```

## 型定義の同期

Cloudflare Workers設定に基づいた型定義を生成：

```bash
npm run cf-typegen
```

## プロジェクト構造

```
smart-measure/
├── src/
│   ├── index.tsx           # メインアプリケーション
│   ├── renderer.tsx        # レイアウトレンダラー
│   └── components.tsx      # 共通コンポーネント
├── public/                 # 静的アセット
├── migrations/             # D1データベースマイグレーション
├── .dev.vars               # ローカル環境変数
├── wrangler.jsonc          # Cloudflare設定
├── ecosystem.config.cjs    # PM2設定
└── README.md               # このファイル
```

## トラブルシューティング

### BRIA APIが動作しない

1. `.dev.vars`に正しいAPIキーが設定されているか確認
2. APIキーが`your-fal-api-key-here`のままになっていないか確認
3. Fal.aiのアカウントにクレジットが残っているか確認

### セルフホスト版が動作しない

1. Pythonサーバーが起動しているか確認: `curl http://localhost:8000/health`
2. ポート8000が他のプロセスに使われていないか確認: `lsof -i :8000`
3. 詳細は `BACKGROUND_REMOVAL.md` を参照

## ライセンス

- **アプリケーション**: MIT License
- **rembg**: MIT License（商用利用可能）
- **BRIA RMBG 2.0**: 商用ライセンス必要（Fal.ai経由で使用）

## サポート

詳細なドキュメント：
- [背景削除機能](./BACKGROUND_REMOVAL.md)
- [本番デプロイガイド](./PRODUCTION_DEPLOYMENT.md)
