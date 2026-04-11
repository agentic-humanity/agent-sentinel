#!/bin/bash
# Watches web/ + desktop/ and syncs to a Windows checkout, then runs cargo tauri build.
# Usage: set WINDOWS_PROJECT_DIR to your Windows path (WSL: /mnt/c/.../agent-sentinel).

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
WINDOWS_PROJECT_DIR="${WINDOWS_PROJECT_DIR:-/mnt/c/Users/ASUS/projects/agent-sentinel}"
LOCK_FILE="/tmp/agent-sentinel-build.lock"
LAST_BUILD_FILE="/tmp/agent-sentinel-last-build"
DEBOUNCE_SECONDS=5

echo "=========================================="
echo "Agent Sentinel - Auto Build (desktop/)"
echo "=========================================="
echo ""
echo "Repo: $REPO_ROOT"
echo "Sync to:    $WINDOWS_PROJECT_DIR"
echo "Debounce:   ${DEBOUNCE_SECONDS}s"
echo ""
echo "Press Ctrl+C to stop"
echo "=========================================="
echo ""

trigger_build() {
    if [ -f "$LOCK_FILE" ]; then
        PID=$(cat "$LOCK_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            echo "[$(date '+%H:%M:%S')] Build already in progress, skipping..."
            return
        fi
        rm -f "$LOCK_FILE"
    fi

    if [ -f "$LAST_BUILD_FILE" ]; then
        LAST_BUILD=$(cat "$LAST_BUILD_FILE")
        CURRENT_TIME=$(date +%s)
        ELAPSED=$((CURRENT_TIME - LAST_BUILD))
        if [ "$ELAPSED" -lt "$DEBOUNCE_SECONDS" ]; then
            return
        fi
    fi

    echo "[$(date '+%H:%M:%S')] Changes detected! Syncing + building..."
    date +%s > "$LAST_BUILD_FILE"
    echo $$ > "$LOCK_FILE"

    rsync -av --delete \
        --exclude node_modules \
        --exclude web/dist \
        --exclude desktop/src-tauri/target \
        --exclude .git \
        --exclude tauri-widget \
        "$REPO_ROOT/" "$WINDOWS_PROJECT_DIR/" >/dev/null 2>&1

    (
        TAURI_DIR="$WINDOWS_PROJECT_DIR/desktop/src-tauri"
        WIN_TAURI=$(wslpath -w "$TAURI_DIR" 2>/dev/null || echo "$TAURI_DIR")
        powershell.exe -NoProfile -Command "Set-Location '$WIN_TAURI'; cargo tauri build"
        BUILD_STATUS=$?

        if [ $BUILD_STATUS -eq 0 ]; then
            echo "[$(date '+%H:%M:%S')] Build OK → desktop/src-tauri/target/release/agent-sentinel-desktop.exe"
        else
            echo "[$(date '+%H:%M:%S')] Build failed (exit $BUILD_STATUS)"
        fi
        rm -f "$LOCK_FILE"
    ) &
}

echo "[$(date '+%H:%M:%S')] Initial build..."
trigger_build

if command -v inotifywait > /dev/null 2>&1; then
    echo "[$(date '+%H:%M:%S')] Watching with inotifywait..."
    while true; do
        inotifywait -r -e modify,create,delete,move \
            --exclude '\.(git|tmp|lock|dist|target)' \
            "$REPO_ROOT/web" \
            "$REPO_ROOT/desktop" \
            2>/dev/null
        trigger_build
    done
else
    echo "[$(date '+%H:%M:%S')] inotifywait missing; polling every 2s..."
    LAST_CHECKSUM=""
    while true; do
        sleep 2
        CURRENT_CHECKSUM=$(find "$REPO_ROOT/web" "$REPO_ROOT/desktop" -type f \( -name "*.vue" -o -name "*.ts" -o -name "*.html" -o -name "*.rs" -o -name "*.toml" -o -name "*.json" \) 2>/dev/null | sort | xargs md5sum 2>/dev/null | md5sum | awk '{print $1}')
        if [ "$CURRENT_CHECKSUM" != "$LAST_CHECKSUM" ]; then
            if [ -n "$LAST_CHECKSUM" ]; then
                trigger_build
            fi
            LAST_CHECKSUM="$CURRENT_CHECKSUM"
        fi
    done
fi
