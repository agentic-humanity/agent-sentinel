<script setup lang="ts">
import { computed } from 'vue'
import type { Agent } from '../composables/useAgents'

export interface DisplayFlags {
  folder: boolean
  model: boolean
  provider: boolean
  userMsg: boolean
  agentReply: boolean
}

const props = defineProps<{
  agent: Agent
  now: number
  display: DisplayFlags
}>()

interface StatusStyle {
  bg: string; border: string; dot: string; color: string; label: string; pulse: boolean
}

const statusStyles = computed((): StatusStyle => {
  const map: Record<string, StatusStyle> = {
    active:  { bg: '#ecfdf5', border: '#6ee7b7', dot: '#10b981', color: '#047857', label: 'Active',          pulse: true },
    idle:    { bg: '#ffffff', border: '#e2e8f0', dot: '#cbd5e1', color: '#64748b', label: 'Idle',            pulse: false },
    waiting: { bg: '#fffbeb', border: '#fcd34d', dot: '#f59e0b', color: '#d97706', label: 'Needs Attention', pulse: true },
    done:    { bg: '#eff6ff', border: '#93c5fd', dot: '#60a5fa', color: '#2563eb', label: 'Done',            pulse: false },
    error:   { bg: '#fef2f2', border: '#fca5a5', dot: '#ef4444', color: '#dc2626', label: 'Error',           pulse: false },
    unknown: { bg: '#f9fafb', border: '#e5e7eb', dot: '#d1d5db', color: '#9ca3af', label: 'Unknown',         pulse: false },
  }
  return map[props.agent.status] ?? map.unknown
})

const cardStyle = computed(() => ({ backgroundColor: statusStyles.value.bg, borderColor: statusStyles.value.border }))
const dotStyle = computed(() => ({ backgroundColor: statusStyles.value.dot }))
const labelStyle = computed(() => ({ color: statusStyles.value.color }))

const timeAgo = computed(() => {
  const diff = props.now - props.agent.updatedAt
  if (diff < 1_000) return 'now'
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  return `${Math.floor(diff / 3_600_000)}h ago`
})

const model = computed(() => props.agent.meta?.model as string | undefined)
const providerLabel = computed(() => props.agent.meta?.providerLabel as string | undefined)
const projectName = computed(() => props.agent.meta?.projectName as string | undefined)
const isSubagent = computed(() => !!props.agent.meta?.isSubagent)
const isBusy = computed(() => props.agent.status === 'active' || props.agent.status === 'waiting')

const hasBadges = computed(() =>
  (isSubagent.value)
  || (props.display.model && model.value)
  || (props.display.provider && providerLabel.value)
  || (props.display.folder && projectName.value)
)

const line1 = computed(() => props.agent.currentStep)
const line2 = computed(() => props.agent.lastStep)
</script>

<template>
  <div
    :style="cardStyle"
    :class="['agent-card border rounded-lg px-4 py-3', isSubagent ? 'ml-6 border-dashed' : '']"
  >
    <!-- Row 1: Dot + Title + Badges + Status -->
    <div class="flex items-start gap-3">
      <div class="relative flex-shrink-0 mt-1">
        <div class="agent-dot w-2.5 h-2.5 rounded-full" :style="dotStyle" />
        <div v-if="statusStyles.pulse" class="absolute inset-0 w-2.5 h-2.5 rounded-full animate-ping opacity-75" :style="dotStyle" />
      </div>

      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="font-medium text-sm text-gray-900">{{ agent.name }}</span>
          <span v-if="isSubagent" class="badge bg-gray-100 text-gray-500 border-gray-200">sub</span>
          <span v-if="display.model && model" class="badge bg-sky-50 text-sky-700 border-sky-200">{{ model }}</span>
          <span v-if="display.provider && providerLabel" class="badge bg-violet-50 text-violet-600 border-violet-200">{{ providerLabel }}</span>
          <span v-if="display.folder && projectName" class="badge bg-gray-50 text-gray-500 border-gray-200">{{ projectName }}</span>
        </div>
      </div>

      <div class="flex-shrink-0 text-right">
        <div class="agent-label text-xs font-medium" :style="labelStyle">{{ statusStyles.label }}</div>
        <div class="text-[10px] text-gray-400 mt-0.5 tabular-nums">{{ timeAgo }}</div>
      </div>
    </div>

    <!-- Steps -->
    <div v-if="line1 || line2" class="mt-2 pl-[22px] space-y-0.5">
      <div v-if="line1" class="step-line flex items-center gap-1.5 text-xs">
        <template v-if="isBusy">
          <span class="inline-block w-1.5 h-1.5 rounded-full animate-pulse flex-shrink-0" :style="dotStyle" />
          <span class="agent-detail truncate font-medium" :style="labelStyle">{{ line1 }}</span>
        </template>
        <template v-else>
          <svg class="w-3 h-3 text-emerald-500 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/></svg>
          <span class="text-gray-400 truncate">{{ line1 }}</span>
        </template>
      </div>
      <div v-if="line2" class="step-line flex items-center gap-1.5 text-xs">
        <svg class="w-3 h-3 text-gray-300 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/></svg>
        <span class="text-gray-300 truncate">{{ line2 }}</span>
      </div>
    </div>

    <!-- User message -->
    <div
      v-if="display.userMsg && agent.userMessage"
      class="mt-2 pl-[22px] text-xs text-gray-500 truncate"
    >
      <span class="text-gray-300 mr-1">You:</span>{{ agent.userMessage }}
    </div>

    <!-- Agent reply -->
    <div
      v-if="display.agentReply && agent.agentReply"
      class="mt-1 pl-[22px] text-xs text-gray-400 line-clamp-2 leading-relaxed"
    >
      <span class="text-gray-300 mr-1">Agent:</span>{{ agent.agentReply }}
    </div>
  </div>
</template>

<style scoped>
.agent-card {
  transition: background-color 0.6s ease, border-color 0.6s ease, transform 0.5s ease;
}
.agent-dot { transition: background-color 0.6s ease; }
.agent-label { transition: color 0.6s ease; }
.agent-detail { transition: color 0.6s ease; }
.badge {
  font-size: 10px; line-height: 1; padding: 2px 6px;
  border-radius: 4px; border-width: 1px; white-space: nowrap;
}
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
