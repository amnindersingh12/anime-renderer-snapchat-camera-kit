import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // This tells Vite to use relative paths for all imports
  base: './', 
  server: {
    host: true,
    port: 5173,
    hmr: {
      // This helps the hot-reload work through the code-server proxy
      clientPort: 5173,
    },
  },
})