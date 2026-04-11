import { describe, it, expect, beforeEach } from 'bun:test'
import { Store } from './store'
import { BrowserProvider } from './providers/browser'
import { createApi } from './api'

describe('HTTP API', () => {
  let store: Store
  let browser: BrowserProvider
  let app: ReturnType<typeof createApi>

  beforeEach(() => {
    store = new Store()
    browser = new BrowserProvider()
    browser.start((agents) => store.updateFromProvider(browser.name, agents))
    app = createApi(store, browser)
  })

  it('GET /api/health', async () => {
    const res = await app.request('http://test/api/health')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; ts: number }
    expect(body.ok).toBe(true)
    expect(typeof body.ts).toBe('number')
  })

  it('GET /api/agents starts empty', async () => {
    const res = await app.request('http://test/api/agents')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('GET /api/agents/:id returns 404 when missing', async () => {
    const res = await app.request('http://test/api/agents/nope')
    expect(res.status).toBe(404)
  })

  it('POST /api/agents/report validates body', async () => {
    const res = await app.request('http://test/api/agents/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
  })

  it('POST /api/agents/report upserts agent into store', async () => {
    const post = await app.request('http://test/api/agents/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site: 'kimi', tabId: 42, url: 'https://example.com', title: 'Tab' }),
    })
    expect(post.status).toBe(200)

    const list = await app.request('http://test/api/agents')
    expect(list.status).toBe(200)
    const agents = (await list.json()) as { id: string; name: string }[]
    expect(agents.length).toBe(1)
    expect(agents[0].id).toBe('browser:kimi:42')
    expect(agents[0].name).toBe('Tab')

    const one = await app.request('http://test/api/agents/browser:kimi:42')
    expect(one.status).toBe(200)
    expect((await one.json() as { id: string }).id).toBe('browser:kimi:42')
  })

  it('DELETE /api/agents/report/:site/:tabId removes agent', async () => {
    await app.request('http://test/api/agents/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site: 'x', tabId: 1, url: 'https://a.com' }),
    })
    const del = await app.request('http://test/api/agents/report/x/1', { method: 'DELETE' })
    expect(del.status).toBe(200)
    const list = await app.request('http://test/api/agents')
    expect(await list.json()).toEqual([])
  })

  it('GET /api/providers lists providers', async () => {
    const res = await app.request('http://test/api/providers')
    expect(res.status).toBe(200)
    const rows = (await res.json()) as { name: string }[]
    expect(rows.some((r) => r.name === 'opencode')).toBe(true)
    expect(rows.some((r) => r.name === 'browser')).toBe(true)
  })

  it('POST /api/permission/:sessionId returns 503 without opencode', async () => {
    const res = await app.request('http://test/api/permission/s1', { method: 'POST' })
    expect(res.status).toBe(503)
  })

  it('GET /api/events returns 200', async () => {
    const res = await app.request('http://test/api/events')
    expect(res.status).toBe(200)
  })
})
