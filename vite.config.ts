import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  // यह GitHub Actions से आने वाले environment variables को लोड करेगा
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    // GitHub Pages के लिए सही बेस पाथ
    base: '/Gen-Z-ai-Chatbot/',

    plugins: [react(), tailwindcss()],
    
    define: {
      // यहाँ हम GitHub Secrets की वैल्यू को कोड में मैप कर रहे हैं
      'process.env.GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY || ""),
      'process.env.API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY || ""),
    },
    
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    
    build: {
      // इसे 'dist' रखें क्योंकि आपकी deploy.yml इसी फोल्डर को अपलोड कर रही है
      outDir: 'dist',
      assetsDir: 'assets',
      emptyOutDir: true,
      sourcemap: false,
      minify: 'esbuild',
    }
  };
});
