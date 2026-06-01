import { defineConfig } from 'vite';
import plugin from '@vitejs/plugin-react';

// https://vitejs.dev/config/
const BACKEND = 'https://localhost:7211'

export default defineConfig({
    plugins: [plugin()],
    server: {
        allowedHosts: ["nonpublic-apogamously-cameron.ngrok-free.dev"],
        port: 3000,
        proxy: {
            '/api': {
                target: BACKEND,
                secure: false,
                changeOrigin: true,
            },
            '/game': {
                target: BACKEND,
                ws: true,
                secure: false,
                changeOrigin: true,
            },
            '/hub': {
                target: BACKEND,
                ws: true,
                secure: false,
                changeOrigin: true,
            },
            '/adminhub': {
                target: BACKEND,
                ws: true,
                secure: false,
                changeOrigin: true,
            },
        },
    }
})