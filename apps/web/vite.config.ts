import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss()],
  server: {
    port: 5173,
    // The playground calls same-origin /api/*; Vite forwards to the Fastify API.
    proxy: { '/api': 'http://localhost:3000' },
  },
});
