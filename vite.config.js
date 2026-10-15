import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The public website runs on 2000; the admin panel sits next to it on 2001.
export default defineConfig({
  plugins: [react()],
  server: { port: 2001, strictPort: true },
  preview: { port: 2001, strictPort: true },
});
