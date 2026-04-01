import { ref, onMounted, onUnmounted } from 'vue'

/**
 * Reactive "now" that ticks every second.
 * Used by timeAgo displays so they count up in real-time.
 */
export function useNow(intervalMs = 1000) {
  const now = ref(Date.now())
  let timer: ReturnType<typeof setInterval> | undefined

  onMounted(() => {
    timer = setInterval(() => {
      now.value = Date.now()
    }, intervalMs)
  })

  onUnmounted(() => {
    clearInterval(timer)
  })

  return now
}
