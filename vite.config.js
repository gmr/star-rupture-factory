import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In CI, set BASE_PATH=/star-rupture-factory/ so the build resolves assets under
// the GitHub Pages project subpath. Local dev keeps '/'.
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  base,
  plugins: [react()],
  server: { port: 5173, open: true },
});
