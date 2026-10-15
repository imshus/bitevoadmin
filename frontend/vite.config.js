import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The public website runs on 2000; the admin panel sits next to it on 2001.
// In development, API calls and uploaded photos are forwarded to the backend on 4000.
const API = process.env.API_PROXY_TARGET || 'http://localhost:4000';
const proxy = { '/api': API, '/uploads': API };

export default defineConfig({
  plugins: [react()],
  server: { port: 2001, strictPort: true, proxy },
  preview: { port: 2001, strictPort: true, proxy },
});
