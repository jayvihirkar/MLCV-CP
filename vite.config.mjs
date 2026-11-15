import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // The ML worker has its own runtime and data. Watching its environment/model
    // cache can stall startup while Chokidar traverses thousands of Python files.
    watch: {
      ignored: ['**/.venv*/**', '**/worker-data/**', '**/data/**', '**/__pycache__/**'],
    },
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
