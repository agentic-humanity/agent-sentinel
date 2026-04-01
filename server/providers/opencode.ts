import { Database } from 'bun:sqlite'
import { existsSync, watch, type FSWatcher } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { Agent, AgentStatus, EmitFn, Provider } from './types'

function getDbPath(): string {
  return join(homedir(), '.local', 'share', 'opencode', 'opencode.db')
}

interface SessionRow {
  id: string
  title: string | null
  slug: string | null
  project_id: string | null
  parent_id: string | null
  time_created: number
  time_updated: number
  worktree: string | null
}

interface PartRow {
  tool: string | null
  status: string | null
  type: string | null
  description: string | null
}

interface MessageRow {
  role: string | null
  model: string | null
  provider: string | null
}

/** Fallback poll interval when fs.watch is unavailable */
const POLL_INTERVAL = 5_000

/** Debounce interval for fs.watch events (avoid hammering on rapid writes) */
const WATCH_DEBOUNCE = 500

/** How long a session stays visible after last update (30 min) */
const VISIBILITY_WINDOW = 30 * 60 * 1000

const MODELS_DEV_URL = 'https://models.dev/api.json'

/**
 * Fetches model display names + provider names from models.dev at startup.
 * Falls back gracefully — if fetch fails, raw IDs are used as-is.
 */
class ModelRegistry {
  private modelNames = new Map<string, string>()
  private providerNames = new Map<string, string>()
  private loaded = false

  async load(): Promise<void> {
    try {
      const res = await fetch(MODELS_DEV_URL, { signal: AbortSignal.timeout(10_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as Record<string, {
        id: string
        name?: string
        models?: Record<string, { id: string; name?: string }>
      }>

      for (const [provId, prov] of Object.entries(data)) {
        if (prov.name) this.providerNames.set(provId, prov.name)
        if (prov.models) {
          for (const [modelId, model] of Object.entries(prov.models)) {
            if (model.name) this.modelNames.set(modelId, model.name)
          }
        }
      }

      this.loaded = true
      console.log(`[opencode] ModelRegistry loaded: ${this.modelNames.size} models, ${this.providerNames.size} providers`)
    } catch (e) {
      console.warn('[opencode] Failed to load models.dev, falling back to raw IDs:', e)
    }
  }

  formatModel(modelId: string): string {
    return this.modelNames.get(modelId) ?? modelId
  }

  formatProvider(providerId: string): string {
    // OpenCode's own provider is called "OpenCode Zen" in their UI
    if (providerId === 'opencode') return 'OpenCode Zen'
    return this.providerNames.get(providerId) ?? providerId
  }
}

/** Describe what the agent is doing from tool name */
function describeAction(tool: string | null, _status: string | null, desc: string | null): string {
  if (!tool) return ''

  const toolLabels: Record<string, string> = {
    bash: 'Running command',
    read: 'Reading file',
    write: 'Writing file',
    edit: 'Editing code',
    glob: 'Searching files',
    grep: 'Searching content',
    task: 'Running sub-agent',
    webfetch: 'Fetching web page',
    websearch: 'Searching web',
    codesearch: 'Searching code',
    todowrite: 'Updating tasks',
    question: 'Asking question',
    skill: 'Loading skill',
    context7_resolve: 'Resolving library',
    'context7_query-docs': 'Querying docs',
    'context7_resolve-library-id': 'Resolving library',
  }

  const label = toolLabels[tool] ?? `Tool: ${tool}`
  const suffix = desc ? ` — ${desc}` : ''
  return `${label}${suffix}`
}

export class OpenCodeProvider implements Provider {
  readonly name = 'opencode'
  private timer: ReturnType<typeof setInterval> | null = null
  private watcher: FSWatcher | null = null
  private watchDebounce: ReturnType<typeof setTimeout> | null = null
  private db: Database | null = null
  private dbPath: string
  private registry = new ModelRegistry()

  constructor(dbPath?: string) {
    this.dbPath = dbPath ?? getDbPath()
  }

  start(emit: EmitFn): void {
    // Load model registry in background, then poll once
    this.registry.load().then(() => this.poll(emit))
    this.poll(emit)

    // Primary: watch WAL file for changes (near-instant)
    this.startWatcher(emit)

    // Fallback: poll every 5s in case fs.watch misses events
    this.timer = setInterval(() => this.poll(emit), POLL_INTERVAL)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.watchDebounce) {
      clearTimeout(this.watchDebounce)
      this.watchDebounce = null
    }
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }

  /**
   * External permission report (future: from OpenCode plugin hook).
   * Forces a session into 'waiting' status until next poll clears it.
   */
  private permissionOverrides = new Set<string>()

  reportPermission(sessionId: string): void {
    this.permissionOverrides.add(sessionId)
    // Will be picked up on next poll cycle
  }

  /** Watch the SQLite WAL file for changes — triggers poll within 500ms of any DB write */
  private startWatcher(emit: EmitFn): void {
    const walPath = this.dbPath + '-wal'
    if (!existsSync(walPath)) {
      console.log('[opencode] WAL file not found, relying on poll only')
      return
    }
    try {
      this.watcher = watch(walPath, () => {
        // Debounce: OpenCode writes multiple times per action
        if (this.watchDebounce) clearTimeout(this.watchDebounce)
        this.watchDebounce = setTimeout(() => this.poll(emit), WATCH_DEBOUNCE)
      })
      console.log('[opencode] Watching WAL file for real-time updates')
    } catch (e) {
      console.warn('[opencode] fs.watch failed, relying on poll only:', e)
    }
  }

  private getDb(): Database | null {
    if (this.db) return this.db
    if (!existsSync(this.dbPath)) return null
    try {
      this.db = new Database(this.dbPath, { readonly: true })
      this.db.exec('PRAGMA journal_mode = WAL')
      return this.db
    } catch (e) {
      console.error('[opencode] Failed to open DB:', e)
      return null
    }
  }

  private poll(emit: EmitFn): void {
    const db = this.getDb()
    if (!db) {
      emit([])
      return
    }

    try {
      const threshold = Date.now() - VISIBILITY_WINDOW

      // Show all non-archived sessions updated within the visibility window
      const sessions = db.prepare(`
        SELECT s.id, s.title, s.slug, s.project_id, s.parent_id,
               s.time_created, s.time_updated,
               p.worktree
        FROM session s
        LEFT JOIN project p ON s.project_id = p.id
        WHERE s.time_archived IS NULL
          AND s.time_updated > ?
        ORDER BY s.time_updated DESC
      `).all(threshold) as SessionRow[]

      const agents: Agent[] = []

      for (const session of sessions) {
        const steps = this.inferStatusAndSteps(db, session)
        const { model, provider } = this.getModelInfo(db, session)
        const { userMessage, agentReply } = this.getConversation(db, session)
        const projectName = session.worktree
          ? session.worktree.replace(/\\/g, '/').split('/').pop()
          : undefined

        const sessionTitle = session.title ?? session.slug ?? session.id.slice(0, 12)

        agents.push({
          id: `opencode:${session.id}`,
          provider: this.name,
          name: sessionTitle,
          status: steps.status,
          currentStep: steps.currentStep || undefined,
          lastStep: steps.lastStep || undefined,
          userMessage,
          agentReply,
          project: session.worktree ?? undefined,
          meta: {
            sessionId: session.id,
            title: session.title,
            slug: session.slug,
            parentId: session.parent_id,
            isSubagent: !!session.parent_id,
            model: model ? this.registry.formatModel(model) : undefined,
            modelRaw: model,
            providerLabel: provider ? this.registry.formatProvider(provider) : undefined,
            providerRaw: provider,
            projectName,
          },
          updatedAt: session.time_updated,
        })
      }

      // Filter: idle subagents are removed immediately (they finished their job)
      const filtered = agents.filter((a) => {
        if (a.meta?.isSubagent && a.status === 'idle') return false
        return true
      })

      emit(filtered)
    } catch (e) {
      console.error('[opencode] Poll error:', e)
      try { this.db?.close() } catch { /* ignore */ }
      this.db = null
      emit([])
    }
  }

  /** Get the 2 most recent completed tool descriptions for a session */
  private getRecentCompleted(db: Database, sessionId: string): string[] {
    const rows = db.prepare(`
      SELECT json_extract(data, '$.tool') as tool,
             json_extract(data, '$.state.metadata.description') as description
      FROM part
      WHERE session_id = ?
        AND json_extract(data, '$.type') = 'tool'
        AND json_extract(data, '$.state.status') = 'completed'
      ORDER BY time_updated DESC
      LIMIT 2
    `).all(sessionId) as PartRow[]
    return rows
      .map((r) => describeAction(r.tool, null, r.description))
      .filter(Boolean)
  }

  /**
   * Staleness thresholds: if a tool has been "running" longer than this,
   * treat it as stale (OpenCode didn't update the status).
   */
  private isStaleRunning(tool: string, ageMs: number): boolean {
    // `task` (subagent) can legitimately run for a long time
    if (tool === 'task') return ageMs > 30 * 60_000 // 30 min
    // Most tools finish in seconds; 2 min is generous
    return ageMs > 2 * 60_000
  }

  private inferStatusAndSteps(
    db: Database,
    session: SessionRow,
  ): { status: AgentStatus; currentStep: string; lastStep: string } {
    const now = Date.now()
    const recentDone = this.getRecentCompleted(db, session.id)

    // --- Rule 0: External permission override (from plugin hook) ---
    if (this.permissionOverrides.has(session.id)) {
      this.permissionOverrides.delete(session.id)
      return {
        status: 'waiting',
        currentStep: 'Permission required',
        lastStep: recentDone[0] ?? '',
      }
    }

    // --- Rule 1: "question" tool running = user must decide ---
    const questionTool = db.prepare(`
      SELECT 1 FROM part
      WHERE session_id = ?
        AND json_extract(data, '$.type') = 'tool'
        AND json_extract(data, '$.tool') = 'question'
        AND json_extract(data, '$.state.status') = 'running'
      LIMIT 1
    `).get(session.id)

    if (questionTool) {
      return {
        status: 'waiting',
        currentStep: 'Waiting for your decision',
        lastStep: recentDone[0] ?? '',
      }
    }

    // --- Rule 2: Any tool genuinely running (not stale) = active ---
    const runningTool = db.prepare(`
      SELECT json_extract(data, '$.tool') as tool,
             json_extract(data, '$.state.metadata.description') as description,
             time_updated
      FROM part
      WHERE session_id = ?
        AND json_extract(data, '$.type') = 'tool'
        AND json_extract(data, '$.state.status') = 'running'
      ORDER BY time_updated DESC
      LIMIT 1
    `).get(session.id) as (PartRow & { time_updated: number }) | undefined

    if (runningTool && !this.isStaleRunning(runningTool.tool ?? '', now - runningTool.time_updated)) {
      return {
        status: 'active',
        currentStep: describeAction(runningTool.tool, null, runningTool.description),
        lastStep: recentDone[0] ?? '',
      }
    }

    // --- Rule 3: Recent output = active ---
    // Use the latest part's own timestamp, not session.time_updated
    const latestPart = db.prepare(`
      SELECT json_extract(data, '$.type') as type,
             time_updated
      FROM part
      WHERE session_id = ?
      ORDER BY time_updated DESC
      LIMIT 1
    `).get(session.id) as { type: string | null; time_updated: number } | undefined

    const partAge = latestPart ? now - latestPart.time_updated : Infinity

    if (latestPart?.type === 'reasoning' && partAge < 30_000) {
      return { status: 'active', currentStep: 'Thinking...', lastStep: recentDone[0] ?? '' }
    }
    if (latestPart?.type === 'text' && partAge < 15_000) {
      return { status: 'active', currentStep: 'Writing response...', lastStep: recentDone[0] ?? '' }
    }
    if ((latestPart?.type === 'step-start' || latestPart?.type === 'patch') && partAge < 15_000) {
      return { status: 'active', currentStep: 'Working...', lastStep: recentDone[0] ?? '' }
    }

    // --- Rule 4: User just sent message ---
    const latestMsg = db.prepare(`
      SELECT json_extract(data, '$.role') as role, time_created
      FROM message WHERE session_id = ? ORDER BY time_created DESC LIMIT 1
    `).get(session.id) as (MessageRow & { time_created: number }) | undefined

    const msgAge = latestMsg ? now - latestMsg.time_created : Infinity

    if (latestMsg?.role === 'user' && msgAge < 30_000) {
      return { status: 'active', currentStep: 'Processing...', lastStep: recentDone[0] ?? '' }
    }

    // --- Rule 5: Permission heuristic ---
    // If session was recently active (part updated in last 60s) but now has no
    // running tool and latest message is assistant → might be waiting for permission.
    // Detected by: session has a completed tool very recently (< 10s)
    // but no new text/tool started after it.
    if (latestPart && partAge < 10_000 && partAge > 2_000) {
      // Agent just stopped producing output 2-10s ago — could be waiting for confirmation
      const lastToolStatus = db.prepare(`
        SELECT json_extract(data, '$.state.status') as status
        FROM part
        WHERE session_id = ?
          AND json_extract(data, '$.type') = 'tool'
        ORDER BY time_updated DESC
        LIMIT 1
      `).get(session.id) as { status: string | null } | undefined

      if (lastToolStatus?.status === 'completed' || lastToolStatus?.status === 'error') {
        // Tool just finished but agent isn't producing new output — possible permission wait
        return {
          status: 'waiting',
          currentStep: 'May need your attention',
          lastStep: recentDone[0] ?? '',
        }
      }
    }

    // --- Rule 6: Idle ---
    return {
      status: 'idle',
      currentStep: recentDone[0] ?? '',
      lastStep: recentDone[1] ?? '',
    }
  }

  private getModelInfo(
    db: Database,
    session: SessionRow,
  ): { model: string | undefined; provider: string | undefined } {
    const row = db.prepare(`
      SELECT json_extract(data, '$.modelID') as model,
             json_extract(data, '$.providerID') as provider
      FROM message
      WHERE session_id = ?
        AND json_extract(data, '$.role') = 'assistant'
        AND json_extract(data, '$.modelID') IS NOT NULL
      ORDER BY time_created DESC
      LIMIT 1
    `).get(session.id) as { model: string | null; provider: string | null } | undefined

    return {
      model: row?.model ?? undefined,
      provider: row?.provider ?? undefined,
    }
  }

  private getConversation(
    db: Database,
    session: SessionRow,
  ): { userMessage: string | undefined; agentReply: string | undefined } {
    // Last user instruction
    const userRow = db.prepare(`
      SELECT substr(json_extract(p.data, '$.text'), 1, 200) as text
      FROM part p
      JOIN message m ON p.message_id = m.id
      WHERE m.session_id = ?
        AND json_extract(m.data, '$.role') = 'user'
        AND json_extract(p.data, '$.type') = 'text'
      ORDER BY p.time_created DESC
      LIMIT 1
    `).get(session.id) as { text: string | null } | undefined

    // Last assistant text reply
    const agentRow = db.prepare(`
      SELECT substr(json_extract(p.data, '$.text'), 1, 300) as text
      FROM part p
      JOIN message m ON p.message_id = m.id
      WHERE m.session_id = ?
        AND json_extract(m.data, '$.role') = 'assistant'
        AND json_extract(p.data, '$.type') = 'text'
      ORDER BY p.time_created DESC
      LIMIT 1
    `).get(session.id) as { text: string | null } | undefined

    const clean = (s: string | null | undefined) =>
      s?.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim() || undefined

    return {
      userMessage: clean(userRow?.text),
      agentReply: clean(agentRow?.text),
    }
  }
}
