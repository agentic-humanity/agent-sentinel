# Agent Sentinel

统一监控多个 AI 工具的实时状态面板。

同时使用 OpenCode、Cursor、Kimi、DeepSeek、Gemini 等工具时，一个页面看清所有 Agent 当前在做什么、做完了没有、是否需要你操作。

## 功能

- **实时状态监控**：Active / Idle / Needs Attention 三态，颜色渐变切换
- **会话过期可视化**：Idle 状态卡片从左到右填充粉红渐变（37%透明度），15分钟后完全填满，直观显示会话新鲜度
- **OpenCode 深度集成**：读取本地 SQLite 数据库，检测所有活跃 Session，15分钟无更新自动隐藏
- **任务步骤追踪**：2 行步骤展示（当前 + 上一个），完成的任务自动打勾下移
- **模型 & Provider 显示**：完整模型名（Claude Opus 4 等）+ API 提供商
- **用户指令 / Agent 回复**：可选展示最后一条用户输入和 Agent 文字回复
- **Sub-agent 管理**：idle 的子代理自动移除，可切换是否显示
- **SSE 实时推送**：前端通过 Server-Sent Events 获取更新，秒级响应
- **REST API**：所有数据通过 API 暴露，可供其他系统集成
- **可扩展 Provider 架构**：实现 `Provider` 接口即可接入新数据源
- **OpenSpec 工作流**：支持 `/opsx:propose`、`/opsx:apply`、`/opsx:archive` 规格驱动开发

## 技术栈

| 层 | 技术 |
|---|------|
| Runtime | Bun |
| Server | Hono |
| Frontend | Vue 3 + Vite + Tailwind CSS v4 |
| DB 读取 | bun:sqlite（读取 OpenCode 数据库）|

## 快速开始

```bash
# 安装依赖
bun install

# 启动 API Server（端口 8777）
bun run dev &

# 启动 Vue Dashboard（端口 5188，代理 API 到 8777）
bun run dev-web

# 打开浏览器
# http://localhost:5188
# 悬浮控件（同源开发）: http://localhost:5188/widget.html
```

复制 `.env.example` 为 `.env` 可改 `PORT`；前端构建会读该端口并同步 Vite 代理与 Tauri 内嵌的 `VITE_SERVER_PORT`。若 API 不在本机默认地址，可设置 `VITE_API_BASE`。

### 桌面控件（Tauri）

需本机已安装 Rust。先启动后端 `bun run dev`，再：

```bash
# 自动拉起 Vite（5188）+ 控件窗口
bun run dev-desktop

# 一键：生成图标（如需）+ 构建前端 + 打 Windows 包（在 Windows 上执行）
bun run build-desktop
```

**说明：** 桌面壳只包含前端；监控数据仍来自本机 `bun` 服务（默认 `http://localhost:8777`），请先启动 `bun run dev` 或 `bun run start`。打包请用 `bun run build-desktop`（会先 `gen-icons`、再 Vite `build`、再 `cargo tauri build`）；不要单独在 `src-tauri` 里跑 `cargo tauri build` 而跳过前端构建。

### 测试

```bash
bun test server
```

## API

```
GET  /api/agents          # 所有 Agent 当前状态
GET  /api/agents/:id      # 单个 Agent 详情
GET  /api/events          # SSE 实时事件流
POST /api/agents/report   # 浏览器扩展上报端点
GET  /api/providers       # 已注册 Provider 列表
GET  /api/health          # 健康检查
```

## 项目结构

```
server/
  index.ts              # Bun + Hono 入口
  api.ts                # REST + SSE 路由
  api.test.ts           # API 集成测试（bun test）
  store.ts              # 内存状态聚合
  providers/
    types.ts            # Provider 接口定义
    opencode.ts         # OpenCode Provider（读 SQLite，15分钟超时）
    browser.ts          # Browser Provider（接收扩展 POST）
web/
  index.html            # 仪表盘入口
  widget.html           # 桌面/悬浮窗入口
  src/
    App.vue             # 主页面 + Settings Popover
    views/Widget.vue    # 紧凑控件视图
    components/
      AgentCard.vue     # Agent 状态卡片（含过期渐变效果）
    composables/
      useAgents.ts      # SSE 订阅（浏览器相对路径 / Tauri 指向后端端口）
      useNow.ts         # 实时时钟（秒级 tick）
desktop/
  src-tauri/            # Tauri v2 窗口壳（无边框、置顶）
scripts/
  gen-icons.ts          # 首次生成 src-tauri/icons（已有则跳过）
  start-widget.ps1      # 仅浏览器打开托管后的 /widget.html
openspec/               # OpenSpec 规格驱动开发
.opencode/              # OpenCode 技能与命令
```

## 扩展 Provider

实现 `Provider` 接口，注册到 `server/index.ts` 即可：

```ts
interface Provider {
  readonly name: string
  start(emit: (agents: Agent[]) => void): void
  stop(): void
}
```

## Display 开关

右上角 Settings 面板支持 6 个显示开关：

| 开关 | 说明 | 默认 |
|------|------|------|
| Model | 显示模型名称 | ON |
| Provider | 显示 API 提供商 | OFF |
| Folder | 显示项目文件夹 | OFF |
| User Input | 显示用户最后一条指令 | OFF |
| Reply | 显示 Agent 最后一段回复 | OFF |
| Sub-agents | 显示活跃子代理 | OFF |

## Roadmap

### Phase 1 — CLI Agent（当前）
- [x] OpenCode Provider（SQLite 轮询 + 15分钟超时）
- [x] 会话过期可视化（粉红渐变填充）
- [x] OpenSpec 集成（规格驱动开发）
- [ ] Claude Code Provider
- [ ] Codex CLI Provider

### Phase 2 — Code Agent（IDE 集成）
- [ ] Cursor Provider（hook / 状态文件）
- [ ] Trae Provider
- [ ] Windsurf Provider

### Phase 3 — 网页对话
- [ ] Edge / Chrome 浏览器扩展
- [ ] Kimi 页面状态检测
- [ ] DeepSeek 页面状态检测
- [ ] 豆包页面状态检测
- [ ] Gemini 页面状态检测
- [ ] ChatGPT / Claude.ai 页面状态检测

### Phase 4 — 平台集成
- [ ] 桌面通知（任务完成 / 需要操作）
- [ ] 外部 API 对接（供其他系统订阅 Agent 状态）
- [ ] 多机器聚合监控

## License

MIT
