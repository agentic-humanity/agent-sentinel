<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAgents } from '../composables/useAgents'
import { useNow } from '../composables/useNow'

const { agents, connected } = useAgents()
const now = useNow(1000)
const pinned = ref(true)

const isTauri = !!(window as any).__TAURI_INTERNALS__

async function togglePin() {
  pinned.value = !pinned.value
  if (!isTauri) return
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().setAlwaysOnTop(pinned.value)
  } catch { /* not in tauri */ }
}

async function closeWidget() {
  if (isTauri) {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      await getCurrentWindow().close()
      return
    } catch { /* fallback */ }
  }
  window.close()
}

async function startDrag(e: MouseEvent) {
  if (!isTauri) return
  e.preventDefault()
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().startDragging()
  } catch { /* not in tauri */ }
}

const sortedAgents = computed(() =>
  [...agents.value]
    .filter(a => !a.meta?.isSubagent)
    .sort((a, b) => {
      const p: Record<string, number> = { active: 0, waiting: 1, idle: 2, error: 3, done: 4, unknown: 5 }
      return (p[a.status] ?? 9) - (p[b.status] ?? 9) || b.updatedAt - a.updatedAt
    })
)

const activeCount = computed(() =>
  sortedAgents.value.filter(a => a.status === 'active' || a.status === 'waiting').length
)

interface StatusStyle { dot: string; color: string; label: string; pulse: boolean }

const statusMap: Record<string, StatusStyle> = {
  active:  { dot: '#10b981', color: '#047857', label: 'Active',    pulse: true },
  idle:    { dot: '#cbd5e1', color: '#64748b', label: 'Idle',      pulse: false },
  waiting: { dot: '#f59e0b', color: '#d97706', label: 'Attention', pulse: true },
  done:    { dot: '#60a5fa', color: '#2563eb', label: 'Done',      pulse: false },
  error:   { dot: '#ef4444', color: '#dc2626', label: 'Error',     pulse: false },
  unknown: { dot: '#d1d5db', color: '#9ca3af', label: 'Unknown',   pulse: false },
}

function getStatus(s: string): StatusStyle {
  return statusMap[s] ?? statusMap.unknown
}

function timeAgo(ts: number): string {
  const d = now.value - ts
  if (d < 1_000) return 'now'
  if (d < 60_000) return `${Math.floor(d / 1000)}s`
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m`
  return `${Math.floor(d / 3_600_000)}h`
}
</script>

<template>
  <div class="widget-shell">
    <div class="widget-card">
      <!-- Custom titlebar -->
      <header class="widget-titlebar" @mousedown="startDrag">
        <div class="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#39C5BB" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4.9 16.1C1 12.2 1 5.8 4.9 1.9"/><path d="M7.8 4.7a6.14 6.14 0 0 0-.8 7.5"/><circle cx="12" cy="9" r="2"/><path d="M16.2 4.7a6.14 6.14 0 0 1 .8 7.5"/><path d="M19.1 1.9a10.56 10.56 0 0 1 0 14.2"/><path d="M9.5 18h5"/><path d="m8 22 4-11 4 11"/>
          </svg>
          <span class="text-xs font-semibold text-gray-800">Sentinel</span>
          <span v-if="activeCount > 0" class="widget-active-badge">{{ activeCount }}</span>
          <span v-if="!connected" class="widget-conn-dot" title="Reconnecting..." />
        </div>
        <div class="flex items-center gap-1" @mousedown.stop>
          <button class="widget-tb-btn" :class="{ 'widget-tb-btn--active': pinned }" @click="togglePin" title="Pin on top">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" :stroke="pinned ? '#39C5BB' : 'currentColor'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>
          </button>
          <button class="widget-tb-btn" @click="closeWidget" title="Close">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
      </header>

      <!-- Agent list -->
      <main class="widget-body">
        <div v-if="sortedAgents.length === 0" class="widget-empty">
          <svg class="mx-auto mb-2 opacity-30" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4.9 16.1C1 12.2 1 5.8 4.9 1.9"/><path d="M7.8 4.7a6.14 6.14 0 0 0-.8 7.5"/><circle cx="12" cy="9" r="2"/><path d="M16.2 4.7a6.14 6.14 0 0 1 .8 7.5"/><path d="M19.1 1.9a10.56 10.56 0 0 1 0 14.2"/><path d="M9.5 18h5"/><path d="m8 22 4-11 4 11"/>
          </svg>
          <div class="text-[11px] text-gray-400">No agents detected</div>
        </div>

        <TransitionGroup v-else name="wlist" tag="div" class="space-y-1.5">
          <div
            v-for="agent in sortedAgents"
            :key="agent.id"
            class="widget-agent"
            :class="{ 'opacity-40': agent.meta?.dying }"
          >
            <div
              v-if="(agent.meta?.expirationProgress as number) > 0"
              class="widget-agent-progress"
              :style="{ width: `${(agent.meta?.expirationProgress as number) * 100}%` }"
            />
            <div class="relative">
              <!-- Top row: dot + name + status -->
              <div class="flex items-center gap-2">
                <span class="relative flex-shrink-0">
                  <span class="block w-2 h-2 rounded-full" :style="{ background: getStatus(agent.status).dot }" />
                  <span v-if="getStatus(agent.status).pulse" class="absolute inset-0 w-2 h-2 rounded-full animate-ping opacity-60" :style="{ background: getStatus(agent.status).dot }" />
                </span>
                <span class="flex-1 text-xs font-medium text-gray-800 truncate">{{ agent.name }}</span>
                <span class="text-[10px] font-medium flex-shrink-0" :style="{ color: getStatus(agent.status).color }">{{ getStatus(agent.status).label }}</span>
              </div>

              <!-- Current step -->
              <div v-if="agent.currentStep" class="mt-0.5 pl-4 text-[11px] truncate" :style="{ color: (agent.status === 'active' || agent.status === 'waiting') ? getStatus(agent.status).color : '#9ca3af' }">
                {{ agent.currentStep }}
              </div>

              <!-- Meta row: badges + time -->
              <div class="mt-1 pl-4 flex items-center gap-1.5">
                <span v-if="agent.meta?.model" class="widget-badge">{{ agent.meta.model }}</span>
                <span v-if="agent.meta?.platform" class="widget-badge widget-badge--platform">{{ agent.meta.platform }}</span>
                <span class="flex-1" />
                <span class="text-[10px] text-gray-300 tabular-nums">{{ timeAgo(agent.updatedAt) }}</span>
              </div>
            </div>
          </div>
        </TransitionGroup>
      </main>
    </div>
  </div>
</template>

<style scoped>
.widget-shell {
  min-height: 100vh;
  background: transparent;
  padding: 0;
}

.widget-card {
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04);
}

.widget-titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid #f0f0f0;
  cursor: grab;
  user-select: none;
  flex-shrink: 0;
}
.widget-titlebar:active { cursor: grabbing; }

.widget-active-badge {
  font-size: 10px;
  font-weight: 700;
  color: #39C5BB;
  background: rgba(57, 197, 187, 0.1);
  padding: 1px 6px;
  border-radius: 8px;
  line-height: 1.4;
}

.widget-conn-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #f59e0b;
  animation: pulse-dot 1.5s ease-in-out infinite;
}

.widget-tb-btn {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: #9ca3af;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.15s;
}
.widget-tb-btn:hover {
  background: #f3f4f6;
  color: #6b7280;
}
.widget-tb-btn--active {
  color: #39C5BB;
}

.widget-body {
  flex: 1;
  padding: 10px;
  overflow-y: auto;
}

.widget-empty {
  text-align: center;
  padding: 40px 16px;
  color: #9ca3af;
}

.widget-agent {
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid #f0f0f0;
  background: #fff;
  position: relative;
  overflow: hidden;
  transition: border-color 0.3s, opacity 1s;
}
.widget-agent:hover {
  border-color: #e0e0e0;
}

.widget-agent-progress {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: linear-gradient(to right, rgba(255, 192, 203, 0.3), rgba(255, 192, 203, 0.15));
  pointer-events: none;
  transition: width 1s linear;
}

.widget-badge {
  font-size: 9px;
  line-height: 1;
  padding: 2px 5px;
  border-radius: 3px;
  background: #f0f9ff;
  color: #0369a1;
  border: 1px solid #bae6fd;
  white-space: nowrap;
}
.widget-badge--platform {
  background: #fff7ed;
  color: #c2410c;
  border-color: #fed7aa;
}

/* Scrollbar */
.widget-body::-webkit-scrollbar { width: 4px; }
.widget-body::-webkit-scrollbar-track { background: transparent; }
.widget-body::-webkit-scrollbar-thumb { background: #e0e0e0; border-radius: 2px; }

/* List transitions */
.wlist-move { transition: transform 0.4s ease; }
.wlist-enter-active { transition: all 0.3s ease; }
.wlist-leave-active { transition: all 0.2s ease; position: absolute; width: calc(100% - 3px); }
.wlist-enter-from { opacity: 0; transform: translateY(-8px); }
.wlist-leave-to { opacity: 0; transform: translateY(8px); }

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
</style>
