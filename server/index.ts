import { serve } from 'bun'
import { existsSync } from 'fs'
import { join } from 'path'
import { Store } from './store'
import { createApi } from './api'
import { OpenCodeProvider } from './providers/opencode'
import { BrowserProvider } from './providers/browser'
import type { Provider } from './providers/types'

const NAME = 'agent-sentinel'
const PORT = parseInt(process.env.PORT ?? '8777', 10)

// --- Initialize store ---
const store = new Store()

// --- Initialize providers ---
const browserProvider = new BrowserProvider()

const providers: Provider[] = [
  new OpenCodeProvider(),
  browserProvider,
]

// Start all providers
for (const provider of providers) {
  provider.start((agents) => store.updateFromProvider(provider.name, agents))
  console.log(`[${NAME}] Provider "${provider.name}" started`)
}

// --- Create Hono app with optional static file serving ---
const app = createApi(store, browserProvider)

// Serve built frontend if available (web/dist/)
const webDistDir = join(import.meta.dir, '..', 'web', 'dist')
if (existsSync(webDistDir)) {
  const { serveStatic } = await import('hono/bun')
  app.use('/*', serveStatic({ root: webDistDir }))
  // SPA fallback: serve index.html for non-API routes
  app.get('*', serveStatic({ path: join(webDistDir, 'index.html') }))
  console.log(`[${NAME}] Serving dashboard from web/dist/`)
}

// --- Start server ---
const server = serve({
  port: PORT,
  fetch: app.fetch,
})

console.log(`[${NAME}] Running at http://localhost:${PORT}`)

// Graceful shutdown
process.on('SIGINT', () => {
  console.log(`\n[${NAME}] Shutting down...`)
  for (const provider of providers) provider.stop()
  server.stop()
  process.exit(0)
})
