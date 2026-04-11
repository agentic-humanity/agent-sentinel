import { ref, onMounted, onUnmounted } from 'vue'

const TAURI = !!(window as any).__TAURI_INTERNALS__

function resolveApiBase(): string {
  const explicit = import.meta.env.VITE_API_BASE?.trim()
  if (explicit) return explicit.replace(/\/$/, '')
  if (TAURI) {
    const port = import.meta.env.VITE_SERVER_PORT || '8777'
    return `http://localhost:${port}`
  }
  return ''
}

const API_BASE = resolveApiBase()

export interface Agent {
  id: string
  provider: string
  name: string
  status: 'active' | 'idle' | 'waiting' | 'done' | 'error' | 'unknown'
  currentStep?: string
  lastStep?: string
  userMessage?: string
  agentReply?: string
  project?: string
  meta?: Record<string, unknown>
  updatedAt: number
}

export function useAgents() {
  const agents = ref<Agent[]>([])
  const connected = ref(false)
  let eventSource: EventSource | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  function connect() {
    if (eventSource) {
      eventSource.close()
    }
    eventSource = new EventSource(`${API_BASE}/api/events`)

    eventSource.onopen = () => {
      connected.value = true
    }

    eventSource.addEventListener('snapshot', (e) => {
      try {
        agents.value = JSON.parse(e.data)
      } catch { /* ignore */ }
    })

    eventSource.addEventListener('agent_remove', (e) => {
      try {
        const { id } = JSON.parse(e.data)
        agents.value = agents.value.filter((a) => a.id !== id)
      } catch { /* ignore */ }
    })

    eventSource.onerror = () => {
      connected.value = false
      eventSource?.close()
      // Reconnect after 3s on error only
      reconnectTimer = setTimeout(connect, 3000)
    }
  }

  onMounted(connect)

  onUnmounted(() => {
    eventSource?.close()
    if (reconnectTimer) clearTimeout(reconnectTimer)
  })

  return { agents, connected }
}
