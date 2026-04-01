import { ref, onMounted, onUnmounted } from 'vue'

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
    eventSource = new EventSource('/api/events')

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
      reconnectTimer = setTimeout(connect, 3000)
    }
  }

  // Reconnect every 15s to guarantee fresh data
  let refreshTimer: ReturnType<typeof setInterval> | null = null

  onMounted(() => {
    connect()
    refreshTimer = setInterval(() => {
      // Force reconnect SSE to get fresh snapshot
      if (eventSource) {
        eventSource.close()
      }
      connect()
    }, 15_000)
  })

  onUnmounted(() => {
    eventSource?.close()
    if (reconnectTimer) clearTimeout(reconnectTimer)
    if (refreshTimer) clearInterval(refreshTimer)
  })

  return { agents, connected }
}
