#!/usr/bin/env bun
/**
 * Ensures desktop/src-tauri/icons exist (fetches a placeholder PNG if needed, runs `tauri icon`).
 */
import { existsSync } from 'fs'
import { join } from 'path'

const root = join(import.meta.dir, '..')
const srcTauri = join(root, 'desktop', 'src-tauri')
const iconsDir = join(srcTauri, 'icons')
const marker = join(iconsDir, '32x32.png')
const iconSource = join(root, 'scripts', 'app-icon.png')

if (existsSync(marker)) {
  console.log('[gen-icons] icons already present, skip')
  process.exit(0)
}

if (!existsSync(iconSource)) {
  console.log('[gen-icons] fetching placeholder PNG...')
  const res = await fetch('https://dummyimage.com/512x512/39C5BB/ffffff.png')
  if (!res.ok) throw new Error(`fetch icon failed: ${res.status}`)
  await Bun.write(iconSource, await res.arrayBuffer())
}

const r = Bun.spawnSync(
  ['bunx', '@tauri-apps/cli', 'icon', '../../scripts/app-icon.png'],
  { cwd: srcTauri, stdout: 'inherit', stderr: 'inherit' },
)
if (r.exitCode !== 0) throw new Error('tauri icon failed')
