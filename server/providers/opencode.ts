import { Database } from 'bun:sqlite'
import { existsSync } from 'fs'
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

const POLL_INTERVAL = 5_000

/** How long a session stays visible after last update (30 min) */
const VISIBILITY_WINDOW = 30 * 60 * 1000

/** Provider-friendly names */
const PROVIDER_LABELS: Record<string, string> = {
  opencode: 'OpenCode Zen',
  'openrouter': 'OpenRouter',
  deepseek: 'DeepSeek',
  'kimi-for-coding': 'Kimi',
  'minimax-cn-coding-plan': 'MiniMax',
  'volcengine-plan': 'Volcengine',
  zai: 'Zai',
}

/** Human-friendly model names */
function formatModel(modelId: string): string {
  const map: Record<string, string> = {
    'claude-opus-4-6': 'Claude Opus 4',
    'claude-sonnet-4-6': 'Claude Sonnet 4',
    'claude-3-5-sonnet': 'Claude Sonnet 3.5',
    'claude-3-5-haiku': 'Claude Haiku 3.5',
    'gpt-5.4': 'GPT-5.4',
    'gpt-5.4-pro': 'GPT-5.4 Pro',
    'deepseek-chat': 'DeepSeek Chat',
    'deepseek-reasoner': 'DeepSeek Reasoner',
    'k2p5': 'Kimi K2P5',
    'glm-5': 'GLM-5',
    'doubao-seed-2.0-code': 'Doubao Seed 2.0 Code',
    'doubao-seed-2.0-pro': 'Doubao Seed 2.0 Pro',
    'doubao-seed-code': 'Doubao Seed Code',
    'MiniMax-M2.5': 'MiniMax M2.5',
    'MiniMax-M2.5-highspeed': 'MiniMax M2.5 HS',
    'MiniMax-M2.7-highspeed': 'MiniMax M2.7 HS',
    'mimo-v2-pro-free': 'MiMo V2 Pro',
    'minimax-m2.5-free': 'MiniMax M2.5',
    'nemotron-3-super-free': 'Nemotron 3 Super',
    'qwen3.6-plus-free': 'Qwen 3.6 Plus',
    'openai/gpt-5.4': 'GPT-5.4',
    'xiaomi/mimo-v2-pro': 'MiMo V2 Pro',
  }
  return map[modelId] ?? modelId
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
  private db: Database | null = null
  private dbPath: string

  constructor(dbPath?: string) {
    this.dbPath = dbPath ?? getDbPath()
  }

  start(emit: EmitFn): void {
    this.poll(emit)
    this.timer = setInterval(() => this.poll(emit), POLL_INTERVAL)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.db) {
      this.db.close()
      this.db = null
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
            model: model ? formatModel(model) : undefined,
            modelRaw: model,
            providerLabel: provider ? (PROVIDER_LABELS[provider] ?? provider) : undefined,
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

  private inferStatusAndSteps(
    db: Database,
    session: SessionRow,
  ): { status: AgentStatus; currentStep: string; lastStep: string } {
    const recentDone = this.getRecentCompleted(db, session.id)

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

    // --- Rule 2: Any tool still running = active ---
    const runningTool = db.prepare(`
      SELECT json_extract(data, '$.tool') as tool,
             json_extract(data, '$.state.metadata.description') as description
      FROM part
      WHERE session_id = ?
        AND json_extract(data, '$.type') = 'tool'
        AND json_extract(data, '$.state.status') = 'running'
      ORDER BY time_updated DESC
      LIMIT 1
    `).get(session.id) as PartRow | undefined

    if (runningTool) {
      return {
        status: 'active',
        currentStep: describeAction(runningTool.tool, null, runningTool.description),
        lastStep: recentDone[0] ?? '',
      }
    }

    // --- Rule 3: Producing text/reasoning/step-start recently = active ---
    const latestPart = db.prepare(`
      SELECT json_extract(data, '$.type') as type
      FROM part
      WHERE session_id = ?
      ORDER BY time_updated DESC
      LIMIT 1
    `).get(session.id) as { type: string | null } | undefined

    const age = Date.now() - session.time_updated

    if (latestPart?.type === 'reasoning' && age < 30_000) {
      return { status: 'active', currentStep: 'Thinking...', lastStep: recentDone[0] ?? '' }
    }
    if (latestPart?.type === 'text' && age < 15_000) {
      return { status: 'active', currentStep: 'Writing response...', lastStep: recentDone[0] ?? '' }
    }
    if (latestPart?.type === 'step-start' && age < 15_000) {
      return { status: 'active', currentStep: 'Starting next step...', lastStep: recentDone[0] ?? '' }
    }

    // --- Rule 4: User just sent message ---
    const latestMsg = db.prepare(`
      SELECT json_extract(data, '$.role') as role
      FROM message WHERE session_id = ? ORDER BY time_created DESC LIMIT 1
    `).get(session.id) as MessageRow | undefined

    if (latestMsg?.role === 'user' && age < 30_000) {
      return { status: 'active', currentStep: 'Processing...', lastStep: recentDone[0] ?? '' }
    }

    // --- Rule 5: Idle ---
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
