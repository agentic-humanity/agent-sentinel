# 自动构建说明（已迁移）

原先的 `tauri-widget` + Makefile 流程已废弃。当前请直接看仓库根目录 **[README.md](./README.md)**：

- **前端**：`bun run build`
- **桌面（Windows + Rust）**：`bun run build:desktop`（在 `desktop/src-tauri` 下执行 `cargo tauri build`，会先跑 `gen:icons` 与 `build`）
- **测试**：`bun test server`

若仍使用仓库里的 `auto-build.sh`，请自行把其中的路径从 `tauri-widget` 改为 `desktop/src-tauri`，或改为调用 `bun run build:desktop`。
