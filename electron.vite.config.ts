import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

const alias = {
  '@': resolve(__dirname, 'src')
};

export default defineConfig({
  main: {
    resolve: {
      alias
    },
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/electron/main.ts')
      }
    }
  },
  preload: {
    resolve: {
      alias
    },
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/electron/preload.ts')
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src'),
    resolve: {
      alias
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/index.html')
      }
    }
  }
});
