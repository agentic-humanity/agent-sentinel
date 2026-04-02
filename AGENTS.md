# AGENTS.md - Agent Sentinel

AI 代理在本仓库的唯一指南。

## 架构

Bun 单体项目：`server/`（Hono + bun:sqlite）· `web/`（Vue 3 + Vite + Tailwind v4）· `extension/`（浏览器扩展，开发中）

**定位**：本地 AI 工具状态监控面板，聚合 OpenCode / Cursor / 浏览器 AI 对话等多源状态。

## 命令

```bash
bun install
bun run dev          # 开发：server 热重载 (8777)
bun run dev:web      # 开发：Vite dev server (5188, 代理 API 到 8777)
bun run build        # 构建前端到 web/dist/
bun run serve        # 生产：单进程启动（API + 静态文件，8777）
bun run start        # 构建 + 启动
```

## 硬性规则

- **CRITICAL**：不修改用户的 OpenCode 数据库（只读模式打开）。
- **CRITICAL**：Provider 接口保持向后兼容，新增字段用 optional。
- **SHOULD**：新 Provider 须实现 `Provider` 接口（`server/providers/types.ts`）。
- **SHOULD**：前端改动后执行 `bun run build` 确认构建通过。
- **NEVER**：硬编码模型名（从 models.dev API 动态获取）。

## 代码约定

Vue 3 `<script setup>` + Tailwind v4；亮色主题；图标 Lucide（SVG inline）；组件 PascalCase · 函数 camelCase。

## 项目结构

```
server/
  index.ts              # Bun + Hono 入口，托管静态文件
  api.ts                # REST + SSE 路由
  store.ts              # 内存状态聚合（变更检测 + SSE 推送）
  providers/
    types.ts            # Provider / Agent 接口定义
    opencode.ts         # OpenCode Provider（SQLite + WAL watch）
    browser.ts          # Browser Provider（接收扩展 POST）
web/
  src/
    App.vue             # 主页面 + Settings Popover
    components/
      AgentCard.vue     # Agent 状态卡片
    composables/
      useAgents.ts      # SSE 订阅
      useNow.ts         # 实时时钟
extension/              # Edge/Chrome 扩展（开发中）
```

## 工作流

1. **Explore**：读相关代码。
2. **Code**：实现；复杂步骤用 todo。
3. **Verify**：`bun run build` 通过。
4. **Commit & push**：`type(scope): description`。
