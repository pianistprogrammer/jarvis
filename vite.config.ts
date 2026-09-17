import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import fs from 'node:fs'
import path from 'node:path'

function copyVadAssets() {
  return {
    name: 'copy-vad-assets',
    apply: 'build' as const,
    writeBundle() {
      const root = process.cwd()
      const output = path.resolve(root, 'dist')
      const assets = [
        '@ricky0123/vad-web/dist/vad.worklet.bundle.min.js',
        '@ricky0123/vad-web/dist/silero_vad_v5.onnx',
        '@ricky0123/vad-web/dist/silero_vad_legacy.onnx',
        ...fs.readdirSync(path.resolve(root, 'node_modules/onnxruntime-web/dist'))
          .filter((file) => file.endsWith('.wasm') || file.endsWith('.mjs'))
          .map((file) => `onnxruntime-web/dist/${file}`),
      ]
      for (const asset of assets) {
        fs.copyFileSync(path.resolve(root, 'node_modules', asset), path.resolve(output, path.basename(asset)))
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    copyVadAssets(),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:4100',
      '/ws': { target: 'ws://127.0.0.1:4100', ws: true },
    },
  },
})
