# Hugging Face Spacesへのデプロイ手順

## 1. Hugging Face アカウント作成

1. https://huggingface.co/ にアクセス
2. 右上の「Sign Up」からアカウント作成（無料）
3. メール認証を完了

## 2. 新しいSpaceを作成

1. https://huggingface.co/spaces にアクセス
2. 「Create new Space」をクリック
3. 以下の設定を入力：
   - **Space name**: `smart-measure-bg-removal`（任意の名前）
   - **License**: Apache 2.0
   - **Select the Space SDK**: `Gradio`
   - **Space hardware**: `CPU basic - Free` （無料プラン）
   - **Repo type**: `Public`（無料プランはPublicのみ）

4. 「Create Space」をクリック

## 3. ファイルをアップロード

### 方法A: Webインターフェース（簡単）

1. Spaceのページで「Files」タブをクリック
2. 「Add file」→「Upload files」をクリック
3. 以下のファイルをアップロード：
   - `app.py`
   - `requirements.txt`
   - `README.md`
   - `.gitignore`

### 方法B: Git（推奨）

```bash
# Spaceをクローン
git clone https://huggingface.co/spaces/YOUR_USERNAME/smart-measure-bg-removal
cd smart-measure-bg-removal

# ファイルをコピー
cp /home/user/huggingface-space/* .

# コミット＆プッシュ
git add .
git commit -m "Initial commit: Background removal API"
git push
```

**注意**: Hugging Face Gitにはアクセストークンが必要です
- Settings → Access Tokens → New token
- Role: `write` を選択

## 4. デプロイ完了を待つ

1. Spaceのページで「Building...」の表示を確認
2. 3〜5分程度でビルド完了
3. 「Running」になれば成功！

## 5. SpaceのURLを確認

```
https://YOUR_USERNAME-smart-measure-bg-removal.hf.space
```

このURLがAPIエンドポイントになります。

## 6. APIエンドポイント

```
POST https://YOUR_USERNAME-smart-measure-bg-removal.hf.space/api/predict
```

## トラブルシューティング

### ビルドエラーが出る場合

1. Spaceページの「Logs」タブでエラー確認
2. `requirements.txt`のバージョン調整
3. `app.py`の構文エラー確認

### メモリ不足エラー

無料プランでは16GB RAMの制限があります。
rembgモデルはメモリ効率が良いので通常は問題ありませんが、
エラーが出る場合は：

1. `u2netp`（軽量モデル）を使用
2. 画像サイズを制限（例：最大2048px）

### コールドスタート（初回遅い）

48時間未使用で自動スリープします。
初回アクセス時は30秒〜2分かかります。

**対策**:
- 定期的にpingする（cron jobなど）
- 有料プラン（$5/月）でスリープなし

## 次のステップ

デプロイ完了後、Cloudflare Pagesのコードを修正して
このSpaceのAPIを呼び出すようにします。
