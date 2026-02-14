import { Hono } from 'hono'
import { renderer } from './renderer'
import type { AppEnv } from './types/bindings'
import { secureCors } from './middleware/cors'

// --- Route modules ---
import auth from './routes/auth'
import authApi from './routes/auth-api'
import dashboard from './routes/dashboard'
import editor from './routes/editor'
import settings from './routes/settings'
import landmarks from './routes/landmarks'
import maskEditor from './routes/mask-editor'

// --- API modules ---
import measurement from './api/measurement'
import images from './api/images'
import bgRemoval from './api/bg-removal'
import csv from './api/csv'
import sync from './api/sync'
import products from './api/products'
import admin from './api/admin'
import billing from './api/billing'

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
app.route('/', landmarks)
app.route('/', maskEditor)

// --- API Routes ---
app.route('/', authApi)  // Firebase authentication API
app.route('/', billing)  // Usage-based billing API
app.route('/', measurement)
app.route('/', images)
app.route('/', bgRemoval)
app.route('/', csv)
app.route('/', sync)
app.route('/', products)
app.route('/', admin)

export default app
