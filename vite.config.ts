import { defineConfig } from 'vite';
export default defineConfig({ base: './', server: { port: 5173, strictPort: true, watch: { ignored: ['**/test-results/**','**/soak-results/**','**/docs/**','**/tests/**'] } }, build: { target: 'es2022', chunkSizeWarningLimit: 1800 } });
