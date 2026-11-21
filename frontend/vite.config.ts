import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const api = { '/api': { target: `http://localhost:${process.env.FORGE_API_PORT ?? 4000}`, changeOrigin: true } };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, proxy: api },
  preview: { port: 4173, proxy: api },
});
