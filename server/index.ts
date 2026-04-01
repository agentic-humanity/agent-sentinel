import { serve } from 'bun'
import { Store } from './store'
import { createApi } from './api'
import { OpenCodeProvider } from './providers/opencode'
import { BrowserProvider } from './providers/browser'
import type { Provider } from './providers/types'

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
  console.log(`[carrick-watch] Provider "${provider.name}" started`)
}

// --- Create Hono app ---
const app = createApi(store, browserProvider)

// --- Start server ---
const server = serve({
  port: PORT,
  fetch: app.fetch,
})

console.log(`[carrick-watch] Server running at http://localhost:${PORT}`)
console.log(`[carrick-watch] Dashboard: http://localhost:${PORT}`)
console.log(`[carrick-watch] API: http://localhost:${PORT}/api/agents`)
console.log(`[carrick-watch] SSE: http://localhost:${PORT}/api/events`)

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[carrick-watch] Shutting down...')
  for (const provider of providers) provider.stop()
  server.stop()
  process.exit(0)
})
