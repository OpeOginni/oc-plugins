import { defineConfig } from 'vite'
import { gui } from '@opencode/plugin/gui/vite'

// Builds dist/gui-experimental.cjs, the desktop app's half. tsup builds the server and TUI halves.
export default defineConfig({ plugins: [gui()] })
