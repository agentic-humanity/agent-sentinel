import type { Agent, AgentStatus, EmitFn, Provider } from './types'

const STALE_THRESHOLD = 60_000 // Remove agents not reported in 60s
const CLEANUP_INTERVAL = 10_000

/**
 * Browser provider — receives reports from the Edge/Chrome extension.
 * Does not actively poll; agents are pushed via POST /api/agents/report.
 */
export class BrowserProvider implements Provider {
  readonly name = 'browser'
  private agents = new Map<string, Agent & { lastReported: number }>()
  private timer: ReturnType<typeof setInterval> | null = null
  private emit: EmitFn | null = null

  start(emit: EmitFn): void {
    this.emit = emit
    // Periodic cleanup of stale browser agents
    this.timer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.emit = null
  }

  /** Called by the API route when extension POSTs a report */
  report(payload: BrowserReport): void {
    const id = `browser:${payload.site}:${payload.tabId}`
    const agent: Agent & { lastReported: number } = {
      id,
      provider: this.name,
      name: payload.title ?? payload.site,
      status: payload.status ?? 'idle',
      currentStep: payload.detail,
      project: undefined,
      meta: {
        site: payload.site,
        tabId: payload.tabId,
        url: payload.url,
        favicon: payload.favicon,
      },
      updatedAt: Date.now(),
      lastReported: Date.now(),
    }
    this.agents.set(id, agent)
    this.flush()
  }

  /** Mark a tab as closed */
  removeTab(site: string, tabId: number): void {
    const id = `browser:${site}:${tabId}`
    this.agents.delete(id)
    this.flush()
  }

  private cleanup(): void {
    const now = Date.now()
    let changed = false
    for (const [id, agent] of this.agents) {
      if (now - agent.lastReported > STALE_THRESHOLD) {
        this.agents.delete(id)
        changed = true
      }
    }
    if (changed) this.flush()
  }

  private flush(): void {
    if (!this.emit) return
    const agents: Agent[] = [...this.agents.values()].map(
      ({ lastReported: _, ...agent }) => agent
    )
    this.emit(agents)
  }
}

/** Payload from the browser extension */
export interface BrowserReport {
  site: string       // e.g. "kimi", "deepseek", "gemini"
  tabId: number
  url: string
  title?: string
  status?: AgentStatus
  detail?: string
  favicon?: string
}
