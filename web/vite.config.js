import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Proxy /api to the backend so the frontend can use relative URLs.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // bind 0.0.0.0 so other PCs on the LAN can reach it
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
