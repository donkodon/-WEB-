# withoutBG サーバーセットアップガイド

## 概要

SmartMeasureアプリに**withoutBG Focus v1.0.0**を使った高品質な背景削除機能を追加しました。

### 技術スタック
- **withoutBG Focus v1.0.0**: オープンソース高精度背景削除モデル
- **FastAPI**: PythonバックエンドAPI
- **PM2**: プロセス管理

---

## セットアップ方法

### **自分のPC（ローカル）でサーバーを起動する**

#### **1. Python環境の準備**

```bash
# Python 3.8以上が必要
python3 --version

# 仮想環境の作成（推奨）
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
# or
venv\Scripts\activate  # Windows
```

#### **2. withoutBGサーバーのインストール**

```bash
cd /home/user/webapp/smart-measure

# セットアップスクリプトを実行
./setup-withoutbg.sh
```

これで以下がインストールされます：
- withoutbg (オープンソースモデル)
- fastapi, uvicorn (APIサーバー)
- pillow, httpx (画像処理・HTTP通信)

**初回実行時の注意:**
- モデルファイルが約320MBダウンロードされます（HuggingFaceから）
- ダウンロードは初回のみで、2回目以降はキャッシュが使われます

#### **3. サーバーの起動**

**方法A: PM2で起動（推奨）**
```bash
# PM2で起動
pm2 start ecosystem-withoutbg.config.cjs

# 起動確認
pm2 list

# ログ確認
pm2 logs withoutbg-server
```

**方法B: 直接起動**
```bash
# 直接起動（開発・デバッグ用）
python3 withoutbg-server.py
```

#### **4. 動作確認**

```bash
# ヘルスチェック
curl http://localhost:8001

# 期待されるレスポンス
{
  "service": "withoutBG API Server",
  "status": "healthy",
  "model": "withoutBG Focus v1.0.0",
  "version": "1.0.0"
}
```

---

## 使い方

### **WEBアプリでの利用**

1. **ログイン**: http://localhost:3000 でWEBアプリにログイン
2. **モデル選択**: 「選択画像を白抜き」ボタンの右側のドロップダウンから「**withoutBG**」を選択
3. **画像を選択**: 白抜きしたい画像にチェック
4. **実行**: 「選択画像を白抜き」をクリック

### **モデルの違い**

| モデル | 説明 | 精度 | 速度 | サーバー |
|--------|------|------|------|----------|
| **rembg (高速・標準)** | 標準的な背景削除 | ★★★☆☆ | ⚡⚡⚡ | Python (port 8000) |
| **withoutBG** | 高品質な背景削除 | ★★★★★ | ⚡⚡ | Python (port 8001) |

---

## トラブルシューティング

### **ポート8001が使用中**

```bash
# ポート8001を使用しているプロセスを確認
lsof -i :8001

# 停止
pm2 stop withoutbg-server
# または
fuser -k 8001/tcp
```

### **モデルのダウンロードが失敗する**

```bash
# 手動でモデルをダウンロード
python3 -c "from withoutbg import WithoutBG; WithoutBG.opensource()"
```

### **メモリ不足エラー**

- withoutBGは約2GBのRAMが必要です
- 小さい画像でテストしてください
- または画像をリサイズしてから処理してください

### **ログの確認**

```bash
# PM2ログ
pm2 logs withoutbg-server --nostream

# ログファイル
cat logs/withoutbg-out.log
cat logs/withoutbg-error.log
```

---

## パフォーマンス

| 項目 | 値 |
|------|------|
| **初回起動** | 5-10秒（モデル読み込み） |
| **画像処理時間** | 2-5秒/枚 |
| **必要メモリ** | 約2GB |
| **モデルサイズ** | 約320MB |

---

## アンインストール

```bash
# PM2からサービスを削除
pm2 delete withoutbg-server

# Python パッケージをアンインストール
pip3 uninstall withoutbg

# ファイルを削除
rm withoutbg-server.py
rm ecosystem-withoutbg.config.cjs
rm setup-withoutbg.sh
```

---

## 参考リンク

- **withoutBG GitHub**: https://github.com/withoutbg/withoutbg
- **withoutBG 公式サイト**: https://withoutbg.com/
- **結果サンプル**: https://withoutbg.com/resources/background-removal-results/model-focus-open-source
