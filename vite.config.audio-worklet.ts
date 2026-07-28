import { defineConfig } from 'vite'

import { isDev, isFirefox, isSafari, r } from './scripts/utils'

export default defineConfig({
  publicDir: false,
  build: {
    watch: isDev
      ? { include: ['./src/audioWorklets/**/*'] }
      : undefined,
    outDir: r(isFirefox ? 'extension-firefox/dist/audioWorklets' : isSafari ? 'extension-safari/dist/audioWorklets' : 'extension/dist/audioWorklets'),
    emptyOutDir: false,
    sourcemap: false,
    target: 'es2018',
    lib: {
      entry: r('src/audioWorklets/volumeNormalizationProcessor.ts'),
      formats: ['es'],
    },
    rollupOptions: {
      output: {
        entryFileNames: 'volume-normalization.js',
      },
    },
  },
})
