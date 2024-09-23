/// <reference types="vite/client" />
import { resolve } from 'node:path';
import { defineConfig, UserConfig } from 'vite';
import nodeExternals from 'rollup-plugin-node-externals';

export default defineConfig(async ({ mode }): Promise<UserConfig> => {
  return {
    mode,
    appType: 'custom',
    resolve: {
      mainFields: [ 'module', 'jsnext:main', 'jsnext' ],
      conditions: ['node'],
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
    },
    esbuild: {
      target: 'node20',
    },
    build: {
      target: 'node20',
      lib: {
        name: 'postcss-theme-manager',
        fileName(format) {
          return format === 'cjs' ? 'index.cjs' : 'index.js';
        },
        entry: resolve(__dirname, 'src/index.ts'),
        formats: ['cjs', 'es'],
      },
      emptyOutDir: false,
      outDir: resolve(__dirname, 'dist'),
      rollupOptions: {
        external: ['postcss', 'node:path', 'node:fs'],
        output: {
          exports: 'named',
          // entryFileNames(chunkInfo: PreRenderedChunk) {
          //   console.log(chunkInfo)
          //   return '[name].[format].js';
          // },
        }
      },
    },
    plugins: [
      {
        ...nodeExternals(),
        name: 'node-externals',
        enforce: 'pre', // The key is to run it before Vite's default dependency resolution plugin
        apply: 'build'
      }
    ],
  }
});
