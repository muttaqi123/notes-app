import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // In development the client calls /api on its own origin and Vite forwards
    // it to Express. That means no CORS in dev and, more usefully, the same
    // relative URLs work in production behind one domain.
    proxy: {
      '/api': { target: process.env.VITE_API_PROXY || 'http://localhost:4000', changeOrigin: true },
      '/uploads': { target: process.env.VITE_API_PROXY || 'http://localhost:4000', changeOrigin: true },
      // Socket.IO negotiates over HTTP before upgrading, so the proxy has to
      // carry both — without `ws: true` the polling handshake works and the
      // upgrade silently fails, which looks like "live updates are just slow".
      '/socket.io': {
        target: process.env.VITE_API_PROXY || 'http://localhost:4000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        /**
         * Split the vendor code by how often it changes and who needs it.
         *
         * The charting library is a third of the bundle and only the Insights
         * page uses it, so it is both lazily imported and given its own chunk:
         * someone who never opens Insights never downloads it, and a change to
         * app code does not invalidate the cached copy for those who do.
         */
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          editor: ['marked', 'dompurify', 'diff'],
          motion: ['framer-motion'],
          dnd: ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
        },
      },
    },
  },
});
