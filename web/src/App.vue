<script setup lang="ts">
import { computed, ref, reactive } from 'vue'
import { useAgents } from './composables/useAgents'
import { useNow } from './composables/useNow'
import AgentCard from './components/AgentCard.vue'

const { agents, connected } = useAgents()
const now = useNow(1000)
const settingsOpen = ref(false)

const display = reactive({
  folder: false,
  model: true,
  provider: false,
  userMsg: false,
  agentReply: false,
  subagent: false,
})

const toggles: { key: keyof typeof display; label: string }[] = [
  { key: 'model',      label: 'Model' },
  { key: 'provider',   label: 'Provider' },
  { key: 'folder',     label: 'Folder' },
  { key: 'userMsg',    label: 'User Input' },
  { key: 'agentReply', label: 'Reply' },
  { key: 'subagent',   label: 'Sub-agents' },
]

const sortedAgents = computed(() => {
  return [...agents.value].sort((a, b) => {
    const priority: Record<string, number> = { active: 0, waiting: 1, idle: 2, error: 3, done: 4, unknown: 5 }
    const pa = priority[a.status] ?? 9
    const pb = priority[b.status] ?? 9
    if (pa !== pb) return pa - pb
    return b.updatedAt - a.updatedAt
  })
})

const filteredAgents = computed(() => {
  if (display.subagent) return sortedAgents.value
  return sortedAgents.value.filter((a) => !a.meta?.isSubagent)
})

const groupedAgents = computed(() => {
  const groups: Record<string, typeof filteredAgents.value> = {}
  for (const agent of filteredAgents.value) {
    const key = agent.provider
    if (!groups[key]) groups[key] = []
    groups[key].push(agent)
  }
  return groups
})

const providerLabels: Record<string, string> = {
  opencode: 'OpenCode',
  browser: 'Browser',
}

const activeCount = computed(() =>
  filteredAgents.value.filter((a) => a.status === 'active' || a.status === 'waiting').length
)
const totalCount = computed(() => filteredAgents.value.length)
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <header class="bg-white border-b border-gray-200 px-6 py-3">
      <div class="max-w-3xl mx-auto flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <!-- Lucide radio-tower in miku color -->
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#39C5BB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4.9 16.1C1 12.2 1 5.8 4.9 1.9"/>
            <path d="M7.8 4.7a6.14 6.14 0 0 0-.8 7.5"/>
            <circle cx="12" cy="9" r="2"/>
            <path d="M16.2 4.7a6.14 6.14 0 0 1 .8 7.5"/>
            <path d="M19.1 1.9a10.56 10.56 0 0 1 0 14.2"/>
            <path d="M9.5 18h5"/>
            <path d="m8 22 4-11 4 11"/>
          </svg>
          <h1 class="text-base font-semibold text-gray-900">Carrick Sentinel</h1>
        </div>
        <div class="flex items-center gap-4">
          <span class="text-xs text-gray-500">
            <span class="font-medium text-gray-700">{{ activeCount }}</span> active
            /
            <span class="font-medium text-gray-700">{{ totalCount }}</span> total
          </span>
          <div class="flex items-center gap-1.5">
            <div :class="['w-1.5 h-1.5 rounded-full', connected ? 'bg-emerald-500' : 'bg-red-400']" />
            <span class="text-[10px] text-gray-400">{{ connected ? 'Live' : 'Reconnecting...' }}</span>
          </div>

          <!-- Settings toggle -->
          <div class="relative">
            <button
              @click="settingsOpen = !settingsOpen"
              :class="[
                'w-7 h-7 flex items-center justify-center rounded-md transition-colors',
                settingsOpen ? 'bg-gray-100 text-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50',
              ]"
              title="Display settings"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="4" x2="4" y1="21" y2="14"/>
                <line x1="4" x2="4" y1="10" y2="3"/>
                <line x1="12" x2="12" y1="21" y2="12"/>
                <line x1="12" x2="12" y1="8" y2="3"/>
                <line x1="20" x2="20" y1="21" y2="16"/>
                <line x1="20" x2="20" y1="12" y2="3"/>
                <line x1="2" x2="6" y1="14" y2="14"/>
                <line x1="10" x2="14" y1="8" y2="8"/>
                <line x1="18" x2="22" y1="16" y2="16"/>
              </svg>
            </button>

            <!-- Popover -->
            <Transition name="popover">
              <div
                v-if="settingsOpen"
                class="absolute right-0 top-9 z-10 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-52"
              >
                <div class="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Display</div>
                <div class="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  <label
                    v-for="t in toggles"
                    :key="t.key"
                    class="flex items-center gap-1.5 cursor-pointer select-none"
                  >
                    <button
                      role="switch"
                      :aria-checked="display[t.key]"
                      @click.stop="display[t.key] = !display[t.key]"
                      :class="[
                        'relative inline-flex h-3.5 w-6 items-center rounded-full transition-colors duration-200 flex-shrink-0',
                        display[t.key] ? 'bg-[#39C5BB]' : 'bg-gray-200',
                      ]"
                    >
                      <span
                        :class="[
                          'inline-block h-2 w-2 rounded-full bg-white shadow-sm transition-transform duration-200',
                          display[t.key] ? 'translate-x-[12px]' : 'translate-x-[3px]',
                        ]"
                      />
                    </button>
                    <span class="text-[11px] text-gray-600">{{ t.label }}</span>
                  </label>
                </div>
              </div>
            </Transition>
          </div>
        </div>
      </div>
    </header>

    <!-- Click-away overlay for settings popover -->
    <div v-if="settingsOpen" class="fixed inset-0 z-0" @click="settingsOpen = false" />

    <!-- Content -->
    <main class="max-w-3xl mx-auto px-6 py-5">
      <div v-if="totalCount === 0" class="text-center py-20 text-gray-400">
        <svg class="mx-auto mb-4 w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4.9 16.1C1 12.2 1 5.8 4.9 1.9"/>
          <path d="M7.8 4.7a6.14 6.14 0 0 0-.8 7.5"/>
          <circle cx="12" cy="9" r="2"/>
          <path d="M16.2 4.7a6.14 6.14 0 0 1 .8 7.5"/>
          <path d="M19.1 1.9a10.56 10.56 0 0 1 0 14.2"/>
          <path d="M9.5 18h5"/>
          <path d="m8 22 4-11 4 11"/>
        </svg>
        <div class="text-sm">No active agents detected</div>
        <div class="text-xs mt-1">OpenCode sessions will appear here automatically</div>
      </div>

      <div v-else class="space-y-5">
        <div v-for="(group, providerName) in groupedAgents" :key="providerName">
          <h2 class="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
            {{ providerLabels[providerName] ?? providerName }}
          </h2>
          <TransitionGroup name="agent-list" tag="div" class="space-y-2 relative">
            <AgentCard
              v-for="agent in group"
              :key="agent.id"
              :agent="agent"
              :now="now"
              :display="display"
            />
          </TransitionGroup>
        </div>
      </div>
    </main>
  </div>
</template>

<style>
.agent-list-move { transition: transform 0.5s ease; }
.agent-list-enter-active { transition: all 0.4s ease; }
.agent-list-leave-active { transition: all 0.3s ease; position: absolute; width: 100%; }
.agent-list-enter-from { opacity: 0; transform: translateY(-12px); }
.agent-list-leave-to { opacity: 0; transform: translateY(12px); }

.popover-enter-active { transition: all 0.15s ease-out; }
.popover-leave-active { transition: all 0.1s ease-in; }
.popover-enter-from { opacity: 0; transform: translateY(-4px) scale(0.97); }
.popover-leave-to { opacity: 0; transform: translateY(-4px) scale(0.97); }
</style>
