import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // PROTOTYPE — this is a mobile-only design, so it needs to be reachable from an
    // actual phone on the LAN, not just localhost. `true` accepts any Host header;
    // fine for a throwaway dev-only prototype, never do this in a real app.
    host: true,
    allowedHosts: true,
  },
})
