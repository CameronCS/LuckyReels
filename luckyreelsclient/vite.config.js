import { defineConfig } from 'vite';
import plugin from '@vitejs/plugin-react';
import https from 'node:https';

// https://vitejs.dev/config/
const HTTPS_BACKEND = 'https://localhost:7211'
const HTTP_BACKEND = 'http://localhost:7011'

function canReachHttpsBackend() {
    return new Promise(resolve => {
        const req = https.request(HTTPS_BACKEND, {
            method: 'HEAD',
            rejectUnauthorized: false,
            timeout: 1000,
        }, res => {
            res.resume()
            resolve(true)
        })

        req.on('timeout', () => {
            req.destroy()
            resolve(false)
        })
        req.on('error', () => resolve(false))
        req.end()
    })
}

const BACKEND = await canReachHttpsBackend() ? HTTPS_BACKEND : HTTP_BACKEND
console.log(`[vite] proxy target: ${BACKEND}`)

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
