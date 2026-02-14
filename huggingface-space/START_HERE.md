# 🚀 Hugging Face Spaces 無料セットアップ手順

## 📦 準備完了！

このディレクトリ（`/home/user/huggingface-space/`）には、Hugging Face Spacesにデプロイするために必要なすべてのファイルが含まれています。

## 📋 ステップバイステップ手順

### ステップ1️⃣: Hugging Face アカウント作成（5分）

1. **https://huggingface.co/** にアクセス
2. 右上の「**Sign Up**」をクリック
3. メールアドレスとパスワードを入力
4. メール認証を完了
5. ✅ 無料アカウント作成完了！

### ステップ2️⃣: 新しいSpaceを作成（3分）

1. **https://huggingface.co/spaces** にアクセス
2. 「**Create new Space**」ボタンをクリック
3. 以下の情報を入力：

   ```
   Space name: smart-measure-bg-removal
   License: Apache 2.0
   Select the Space SDK: Gradio
   Space hardware: CPU basic - Free
   Repo type: Public
   ```

4. 「**Create Space**」をクリック
5. ✅ Space作成完了！

### ステップ3️⃣: ファイルをアップロード（5分）

#### 方法A: Webインターフェース（簡単・推奨）

1. Spaceのページで「**Files**」タブをクリック
2. 「**Add file**」→「**Upload files**」をクリック
3. 以下のファイルをドラッグ&ドロップまたは選択：
   - ✅ `app.py`
   - ✅ `requirements.txt`
   - ✅ `README.md`
   - ✅ `.gitignore`
4. 「**Commit changes to main**」をクリック
5. ✅ アップロード完了！

#### 方法B: Git（上級者向け）

```bash
# アクセストークン取得
# https://huggingface.co/settings/tokens → New token → Role: write

# Spaceをクローン
git clone https://huggingface.co/spaces/YOUR_USERNAME/smart-measure-bg-removal
cd smart-measure-bg-removal

# ファイルをコピー
cp /home/user/huggingface-space/{app.py,requirements.txt,README.md,.gitignore} .

# コミット＆プッシュ
git add .
git commit -m "Initial commit: Background removal API"
git push
```

### ステップ4️⃣: ビルド完了を待つ（3〜5分）

1. Spaceのページに戻る
2. 「**Building...**」の表示を確認
3. ビルドログを確認（「**Logs**」タブ）
4. **「Running」**になれば成功！🎉

### ステップ5️⃣: APIのURLを確認（1分）

Spaceが起動したら、以下のURLでアクセスできます：

```
https://YOUR_USERNAME-smart-measure-bg-removal.hf.space
```

**例**:
- ユーザー名が `kenji` の場合
- URL: `https://kenji-smart-measure-bg-removal.hf.space`

### ステップ6️⃣: 動作確認（2分）

1. SpaceのURLにブラウザでアクセス
2. Gradio UIが表示される
3. 「**画像アップロード**」タブで画像を選択
4. 「**背景削除**」ボタンをクリック
5. 背景が削除された画像が表示されれば成功！✅

## 🔗 次のステップ: Cloudflareと統合

Spaceが正常に動作したら、次は`CLOUDFLARE_INTEGRATION.md`を読んで、Cloudflare Pagesのコードを修正します。

## 📊 予想される結果

| 項目 | 時間 | 状態 |
|------|------|------|
| アカウント作成 | 5分 | ✅ 完了 |
| Space作成 | 3分 | ✅ 完了 |
| ファイルアップロード | 5分 | ✅ 完了 |
| ビルド | 3〜5分 | ⏳ 待機中 |
| 動作確認 | 2分 | 🎯 テスト |
| **合計** | **約20分** | |

## ⚠️ よくある問題

### Q1: ビルドエラーが出る

**A**: 「Logs」タブでエラー内容を確認。ほとんどの場合は自動で解決します。

### Q2: "Module not found" エラー

**A**: `requirements.txt`が正しくアップロードされているか確認。

### Q3: 初回アクセスが遅い

**A**: コールドスタート（30秒〜2分）は正常です。48時間未使用でスリープします。

### Q4: APIが応答しない

**A**: Spaceが「Running」状態か確認。「Sleeping」なら一度アクセスして起こす。

## 💰 料金について

- ✅ **完全無料**（CPU basic）
- ✅ 月額料金なし
- ✅ 使用量制限なし
- ⚠️ 48時間未使用で自動スリープ
- ⚠️ 同時実行は1リクエストのみ

スリープを解除したい場合：
- **$5/月**で常時起動（CPU basic永続化）

## 📞 サポート

問題が発生した場合：
1. `DEPLOYMENT.md`のトラブルシューティングを確認
2. Hugging Face Community フォーラムで質問
3. このセッションで質問

## 🎉 成功したら

Cloudflareとの統合に進みましょう！
`CLOUDFLARE_INTEGRATION.md`を開いて手順を確認してください。

---

**作成されたファイル一覧:**
- ✅ `app.py` - メインアプリケーション
- ✅ `requirements.txt` - 依存パッケージ
- ✅ `README.md` - Space説明
- ✅ `.gitignore` - Git除外設定
- ✅ `DEPLOYMENT.md` - デプロイ詳細手順
- ✅ `CLOUDFLARE_INTEGRATION.md` - Cloudflare統合手順
- ✅ `START_HERE.md` - このファイル

**アーカイブファイル:**
- ✅ `/home/user/huggingface-space.tar.gz` - 全ファイルのバックアップ
