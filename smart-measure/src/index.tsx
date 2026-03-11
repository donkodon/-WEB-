import { Hono } from 'hono'
import { renderer } from './renderer'
import type { AppEnv } from './types/bindings'
import { secureCors } from './shared/middleware/cors'

// --- Route modules ---
import auth from './features/auth/routes/auth'
import authApi from './features/auth/api/auth-api'
import dashboard from './features/dashboard/routes/dashboard'
import editor from './features/image-editor/routes/editor'
import settings from './features/dashboard/routes/settings'
import pricing from './features/pricing/routes/pricing'
import credits from './features/pricing/routes/credits'
import landmarks from './features/measurement/routes/landmarks'
import maskEditor from './features/mask/routes/mask-editor'
import maskApi from './features/mask/api/mask'

// --- API modules ---
import measurement from './features/measurement/api/measurement'
import images from './features/image-editor/api/images'
import bgRemoval from './features/bg-removal/api/routes'
import csv from './features/data-sync/api/csv'
import sync from './features/data-sync/api/sync'
import products from './features/dashboard/api/products'
import admin from './features/dashboard/api/admin'
import billing from './features/billing/api/billing'

const app = new Hono<AppEnv>()

// --- Middleware ---
// SECURITY: Use secure CORS with origin whitelist instead of wildcard
app.use('/*', secureCors())
app.use(renderer)

// --- Page Routes ---
app.route('/', auth)
app.route('/', dashboard)
app.route('/', editor)
app.route('/', settings)
app.route('/', pricing)
app.route('/', credits)
app.route('/', landmarks)
app.route('/', maskEditor)

// --- API Routes ---
// NOTE: images router MUST be first to avoid auth middleware from other routers
app.route('/', images)  // Image proxy (no auth required for <img> tags)
app.route('/', authApi)  // Firebase authentication API
app.route('/', billing)  // Usage-based billing API
app.route('/', maskApi)  // Mask editing API (update, save, regenerate)
app.route('/', measurement)
app.route('/', bgRemoval)
app.route('/', csv)
app.route('/', sync)
app.route('/', products)
app.route('/', admin)

export default app
