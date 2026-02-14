# -WEB- プロジェクト

STAYGOLDの業務効率化のためのWebアプリケーション群

## 📦 プロジェクト構成

このリポジトリには以下のアプリケーションが含まれています：

### 1. 📸 Smart Measure (採寸撮影用アプリ)
**メインディレクトリ**: `smart-measure/`

アパレル商品の採寸・撮影業務を効率化するための統合Webアプリケーション。

**主な機能**:
- 📷 商品画像のアップロードと管理
- 📏 AI自動採寸機能（Mediapipe Pose Detection）
- ✂️ 背景除去機能
- 📊 採寸データの一覧表示・編集
- 📱 モバイルアプリとの同期機能
- 📈 使用量・課金管理

**技術スタック**:
- **フレームワーク**: Hono + TypeScript
- **デプロイ**: Cloudflare Pages/Workers
- **データベース**: Cloudflare D1 (SQLite)
- **ストレージ**: Cloudflare R2
- **認証**: Firebase Authentication

**詳細はこちら**: [smart-measure/README.md](./smart-measure/README.md)

### 2. 🖼️ Image Upload API
**メインディレクトリ**: `image-upload-api/`

画像アップロード用のシンプルなAPIサービス。

**主な機能**:
- 画像ファイルのアップロード
- Cloudflare R2への保存
- 公開URLの生成

**技術スタック**:
- Cloudflare Workers
- Cloudflare R2

### 3. 🎨 Background Removal Demo
**ファイル**: `remove-bg-demo.html`

背景除去機能のデモページ。

## 🚀 開発開始方法

### Smart Measureアプリの起動

```bash
cd smart-measure

# 依存関係のインストール（初回のみ）
npm install

# ローカル開発環境の起動
npm run build
pm2 start ecosystem.config.cjs

# サービスの確認
curl http://localhost:3000
```

### データベースのセットアップ

```bash
cd smart-measure

# マイグレーションの適用（ローカル）
npm run db:migrate:local

# テストデータの投入
npm run db:seed
```

## 📚 各プロジェクトのドキュメント

- [Smart Measure 詳細ドキュメント](./smart-measure/README.md)
- [パフォーマンス最適化の記録](./smart-measure/PERFORMANCE_FIX_N_PLUS_1.md)
- [セキュリティ修正の記録](./smart-measure/SECURITY_FIX_AUTH_CORS.md)
- [本番デプロイガイド](./smart-measure/PRODUCTION_DEPLOYMENT.md)

## 🔐 環境変数の設定

各プロジェクトの`.env.example`を参考に、`.dev.vars`ファイルを作成してください。

## 📝 開発者

**ケンジ** - サプライチェーンマネジメント企画部マネージャー兼フルフィルメント業務責任者

## 📄 ライセンス

このプロジェクトはSTAYGOLD社の内部使用のために開発されています。
