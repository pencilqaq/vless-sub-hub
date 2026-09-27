import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
const webRoot = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = path.resolve(webRoot, '..');
function loadEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.replace(/^\uFEFF/, '').trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index < 1) continue;
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[line.slice(0, index).trim()] = value;
  }
  return out;
}
const fileEnv = loadEnvFile(path.join(projectRoot, '.env'));
function pick(envValue, fileValue) {
  const raw = envValue !== undefined ? envValue : fileValue;
  return String(raw == null ? '' : raw).trim();
}
const webPort = Number(pick(process.env.WEB_PORT, fileEnv.WEB_PORT) || 5173);
function pickBackend(envObj, fileObj) {
  if (envObj.SERVER_PORT !== undefined) return String(envObj.SERVER_PORT).trim();
  if (fileObj.SERVER_PORT !== undefined) return String(fileObj.SERVER_PORT).trim();
  return '';
}
const explicitBackend = pick(process.env.BACKEND_PORT, undefined) || pickBackend(process.env, fileEnv);
const backendUrl =
  process.env.BACKEND_URL || 'http://127.0.0.1:' + (explicitBackend || String(webPort + 1));
export default defineConfig({
  root: webRoot,
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('../shared', import.meta.url))
    }
  },
  server: {
    port: webPort,
    proxy: {
      '/api': { target: backendUrl, changeOrigin: false },
      '/sub': { target: backendUrl, changeOrigin: false }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](naive-ui|@css-render|seemly|vueuc|vdirs|treemate|date-fns)[\\/]/.test(id)) return 'vendor-naive';
          if (/[\\/]node_modules[\\/](qrcode|dijkstrajs|encode-utf8)[\\/]/.test(id)) return 'vendor-qrcode';
          if (/[\\/]node_modules[\\/](vue|vue-router|@vue)[\\/]/.test(id)) return 'vendor-vue';
          return 'vendor';
        }
      }
    }
  }
});
