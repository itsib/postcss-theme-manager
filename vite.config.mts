/// <reference types="vite/client" />
import { resolve } from 'node:path';
import { defineConfig, UserConfig } from 'vite';

export default defineConfig(async ({ mode }): Promise<UserConfig> => {
  return {
    mode,
    appType: 'custom',
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
    },
    build: {
      minify: true,
      lib: {
        name: 'postcss-theme-manager',
        fileName: 'index',
        entry: resolve(__dirname, 'src/index.ts'),
      },
      emptyOutDir: false,
      outDir: resolve(__dirname, 'dist'),
      rollupOptions: {
        external: ['postcss'],
        output: {
          globals: {
            postcss: 'postcss',
          },
        }
      },
    },
    plugins: [

    ],
  }
});
