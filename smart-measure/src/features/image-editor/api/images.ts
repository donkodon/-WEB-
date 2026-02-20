/**
 * Image Editor API - エントリポイント
 *
 * 各機能は別ファイルに分割されています:
 *   upload.ts       - 画像アップロード・順序変更
 *   edit-settings.ts - 編集設定 CRUD
 *   download.ts     - 画像ダウンロード・最終保存
 *   proxy.ts        - 画像プロキシ（R2直接返却 / CORS回避）
 */
import { Hono } from 'hono'
import type { AppEnv } from '../../../types/bindings'
import upload from './upload'
import editSettings from './edit-settings'
import download from './download'
import proxy from './proxy'

const images = new Hono<AppEnv>()

images.route('/', upload)
images.route('/', editSettings)
images.route('/', download)
images.route('/', proxy)

export default images
