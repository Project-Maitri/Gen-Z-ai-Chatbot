import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    // 1. GitHub Pages के लिए यह पाथ बहुत ज़रूरी है
    base: '/Gen-Z-ai-Chatbot/',
    
    plugins: [react(), tailwindcss()],
    
    // 2. API Key को सुरक्षित तरीके से जोड़ने के लिए
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    
    // 3. पाथ रिजॉल्यूशन को सरल बनाया गया है
    resolve: {
      alias: {
        '@': '/',
      },
    },
    
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    
    // 4. बिल्ड आउटपुट को GitHub Pages के अनुकूल बनाने के लिए
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      emptyOutDir: true,
    }
  };
});