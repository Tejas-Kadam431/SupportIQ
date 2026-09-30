import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Resolve optional Zod imports from this app across pnpm worktree stores.
  resolve: { dedupe: ["zod"] },
})
