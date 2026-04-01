import type { Agent } from './providers/types'

export type SSEClient = {
  id: string
  controller: ReadableStreamDefaultController
}

/**
 * In-memory store that aggregates agents from all providers.
 * Notifies SSE clients on every change.
 */
export class Store {
  /** All agents keyed by agent.id */
  private agents = new Map<string, Agent>()
  /** Connected SSE clients */
  private clients = new Map<string, SSEClient>()
  private clientSeq = 0

  /** Replace all agents from a specific provider */
  updateFromProvider(providerName: string, agents: Agent[]): void {
    // Remove stale agents from this provider
    for (const [id, agent] of this.agents) {
      if (agent.provider === providerName) {
        this.agents.delete(id)
      }
    }
    // Add fresh agents
    for (const agent of agents) {
      this.agents.set(agent.id, agent)
    }
    this.broadcast()
  }

  /** Upsert a single agent (used by browser provider) */
  upsertAgent(agent: Agent): void {
    this.agents.set(agent.id, agent)
    this.broadcast()
  }

  /** Remove an agent by id */
  removeAgent(id: string): void {
    if (this.agents.delete(id)) {
      this.broadcastEvent('agent_remove', { id })
    }
  }

  /** Get all agents as array, sorted by updatedAt desc */
  getAll(): Agent[] {
    return [...this.agents.values()].sort((a, b) => b.updatedAt - a.updatedAt)
  }

  /** Get single agent */
  getById(id: string): Agent | undefined {
    return this.agents.get(id)
  }

  /** Register an SSE client, returns cleanup function */
  addClient(controller: ReadableStreamDefaultController): () => void {
    const id = `sse_${++this.clientSeq}`
    this.clients.set(id, { id, controller })

    // Send current snapshot immediately
    this.sendTo(controller, 'snapshot', this.getAll())

    return () => {
      this.clients.delete(id)
    }
  }

  private broadcast(): void {
    const data = this.getAll()
    for (const client of this.clients.values()) {
      this.sendTo(client.controller, 'snapshot', data)
    }
  }

  private broadcastEvent(event: string, data: unknown): void {
    for (const client of this.clients.values()) {
      this.sendTo(client.controller, event, data)
    }
  }

  private sendTo(controller: ReadableStreamDefaultController, event: string, data: unknown): void {
    try {
      const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
      controller.enqueue(new TextEncoder().encode(payload))
    } catch {
      // Client disconnected, ignore
    }
  }
}
