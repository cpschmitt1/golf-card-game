import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Lets a `localtunnel`/similar HTTPS tunnel reach the dev server for testing things (like
    // push notifications) that need a real phone hitting a real secure-context origin. Dev
    // server only — has no effect on the production static build.
    allowedHosts: ['.loca.lt'],
  },
});
