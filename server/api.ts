import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { streamSSE } from 'hono/streaming'
import type { Store } from './store'
import type { BrowserProvider, BrowserReport } from './providers/browser'

export function createApi(store: Store, browserProvider: BrowserProvider): Hono {
  const app = new Hono()

  app.use('*', cors())

  // Health check
  app.get('/api/health', (c) => c.json({ ok: true, ts: Date.now() }))

  // All agents snapshot
  app.get('/api/agents', (c) => c.json(store.getAll()))

  // Single agent
  app.get('/api/agents/:id', (c) => {
    const agent = store.getById(c.req.param('id'))
    if (!agent) return c.json({ error: 'not found' }, 404)
    return c.json(agent)
  })

  // SSE event stream
  app.get('/api/events', (c) => {
    return streamSSE(c, async (stream) => {
      const controller = {
        enqueue: (chunk: Uint8Array) => {
          stream.write(new TextDecoder().decode(chunk))
        },
      } as ReadableStreamDefaultController

      const cleanup = store.addClient(controller)

      // Keep alive
      const keepAlive = setInterval(() => {
        try {
          stream.write(': keepalive\n\n')
        } catch {
          clearInterval(keepAlive)
        }
      }, 15_000)

      // Wait until client disconnects
      try {
        await stream.sleep(2_147_483_647) // ~25 days, effectively forever
      } catch {
        // Client disconnected
      } finally {
        clearInterval(keepAlive)
        cleanup()
      }
    })
  })

  // Browser extension report endpoint
  app.post('/api/agents/report', async (c) => {
    try {
      const body = await c.req.json<BrowserReport>()
      if (!body.site || body.tabId === undefined || !body.url) {
        return c.json({ error: 'missing required fields: site, tabId, url' }, 400)
      }
      browserProvider.report(body)
      return c.json({ ok: true })
    } catch {
      return c.json({ error: 'invalid JSON' }, 400)
    }
  })

  // Browser extension: tab closed
  app.delete('/api/agents/report/:site/:tabId', (c) => {
    const site = c.req.param('site')
    const tabId = parseInt(c.req.param('tabId'), 10)
    if (isNaN(tabId)) return c.json({ error: 'invalid tabId' }, 400)
    browserProvider.removeTab(site, tabId)
    return c.json({ ok: true })
  })

  // List registered providers (for extensibility visibility)
  app.get('/api/providers', (c) => {
    return c.json([
      { name: 'opencode', type: 'poll', status: 'active' },
      { name: 'browser', type: 'push', status: 'active' },
    ])
  })

  return app
}
