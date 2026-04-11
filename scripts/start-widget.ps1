# Agent Sentinel - Lightweight Widget Launcher
# Opens the widget view in your default browser.
# For a native desktop widget experience, use the Tauri desktop app.
#
# Prerequisites: the server must be running (bun dev)

param(
    [string]$ServerUrl = "http://localhost:8777"
)

$widgetUrl = "$ServerUrl/widget.html"

Write-Host "Opening Agent Sentinel widget at $widgetUrl ..." -ForegroundColor Cyan
Start-Process $widgetUrl
