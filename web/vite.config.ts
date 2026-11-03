import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // NEXT_PUBLIC_ too, so the keys as Supabase's dashboard prints them work.
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  server: { port: 5173 },
});
