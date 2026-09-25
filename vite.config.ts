import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // 相对路径打包：Electron 用 file:// 加载 dist/index.html
  base: './',
  build: {
    outDir: 'dist',
    // 重要：本机 WorkBuddy 的 safe-delete shim 会拦截 fs.rmSync，
    // 开启 emptyOutDir 会导致 Vite 清空目录时报错，故关闭。
    emptyOutDir: false,
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
