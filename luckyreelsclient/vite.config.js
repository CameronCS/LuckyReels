import { defineConfig } from 'vite';
import plugin from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [plugin()],
    server: {
        allowedHosts: ["nonpublic-apogamously-cameron.ngrok-free.dev"],
        port: 55807,
    }
})