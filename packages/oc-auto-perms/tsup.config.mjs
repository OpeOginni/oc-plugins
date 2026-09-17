import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/*.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'es2022',
  outDir: 'dist',
  clean: true,
  bundle: false,
  sourcemap: true,
})
