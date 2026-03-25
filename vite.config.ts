import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    // 1. GitHub Pages के लिए './' सबसे सुरक्षित है क्योंकि यह किसी भी रिपॉजिटरी नाम के साथ काम करता है
    base: mode === 'production' ? './' : '/',
    
    plugins: [react(), tailwindcss()],
    
    // 2. API Key को सुरक्षित तरीके से जोड़ने के लिए
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    
    // 3. पाथ रिजॉल्यूशन को ठीक किया गया है
    resolve: {
      alias: {
        '@': '/src',
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