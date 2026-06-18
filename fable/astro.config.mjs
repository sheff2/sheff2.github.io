import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  devToolbar: { enabled: false },
  site: 'https://shaunh.dev',
  build: {
    inlineStylesheets: 'auto',
  },
  vite: {
    resolve: {
      // onnxruntime-web: pick the build that loads its .wasm externally
      // (we serve it from public/ort/) instead of bundling a 12 MB copy.
      conditions: ['onnxruntime-web-use-extern-wasm'],
    },
  },
});
