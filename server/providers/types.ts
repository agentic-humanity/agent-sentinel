/** Unified agent status across all providers */
export type AgentStatus = 'active' | 'idle' | 'waiting' | 'done' | 'error' | 'unknown'

/** A single monitored agent instance */
export interface Agent {
  /** Unique ID: "{provider}:{localId}" */
  id: string
  /** Provider name, e.g. "opencode", "browser" */
  provider: string
  /** Human-readable name, e.g. "OpenCode: cyber-carrick" */
  name: string
  /** Current status */
  status: AgentStatus
  /** Current step (active task) */
  currentStep?: string
  /** Previous completed step */
  lastStep?: string
  /** Last user instruction */
  userMessage?: string
  /** Last agent text reply (truncated) */
  agentReply?: string
  /** Project / workspace directory */
  project?: string
  /** Provider-specific metadata */
  meta?: Record<string, unknown>
  /** Last updated timestamp (epoch ms) */
  updatedAt: number
}

/** Callback to emit updated agent list from a provider */
export type EmitFn = (agents: Agent[]) => void

/**
 * Provider interface — implement this to add a new data source.
 *
 * Lifecycle:
 *   1. `start(emit)` is called once; provider begins polling/watching
 *   2. Call `emit(agents)` whenever the agent list changes
 *   3. `stop()` is called on shutdown
 */
export interface Provider {
  /** Unique provider name */
  readonly name: string
  /** Start monitoring, call emit() with updated agents */
  start(emit: EmitFn): void
  /** Stop monitoring, clean up resources */
  stop(): void
}
