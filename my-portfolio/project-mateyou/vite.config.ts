import tailwindcss from '@tailwindcss/vite'
import viteReact from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    TanStackRouterVite({ autoCodeSplitting: true }),
    viteReact(),
    tailwindcss(),
    nodePolyfills({
      protocolImports: true,
    }),
  ],
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['buffer', 'stream-browserify', 'events', 'util', 'react', 'react-dom', '@radix-ui/react-popover', '@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      stream: 'stream-browserify',
      buffer: 'buffer',
      events: 'events',
      util: 'util',
      process: 'process/browser',
    },
  },
  build: {
    chunkSizeWarningLimit: 1000, // 1MB로 경고 기준 증가
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          // 컴포넌트들을 하나의 chunk로 그룹화
          components: [
            'src/components/ui/Modal.tsx',
            'src/components/ui/Avatar.tsx',
            'src/components/ui/Button.tsx',
            'src/components/ui/Input.tsx',
            'src/components/ui/Textarea.tsx',
            'src/components/layouts/Navigation.tsx',
            'src/components/layouts/Footer.tsx',
            'src/components/features/PartnerCard.tsx',
            'src/components/features/PartnerDashboard.tsx',
            'src/components/modals/ChargeModal.tsx',
            'src/components/modals/ProfileEditModal.tsx',
            'src/components/modals/PartnerRequestModal.tsx',
            'src/components/modals/BannerModal.tsx',
            'src/components/forms/ImageUpload.tsx',
            'src/components/forms/GameInfoInput.tsx',
            'src/components/forms/PartnerApplicationForm.tsx',
            'src/components/index.ts',
          ],
          // 라우트 컴포넌트들
          routes: [
            'src/routes/index.tsx',
            'src/routes/chat.tsx',
            'src/routes/partners/index.tsx',
            'src/routes/partner.tsx',
          ],
        },
      },
    },
  },
  // SPA fallback을 위한 설정
  appType: 'spa',
  server: {
    host: true, // 외부 IP 접근 허용 (0.0.0.0)
    port: 3000,
    allowedHosts: ['mateyou.peo.kr'],
    // 개발용 프록시 (CORS 우회)
    proxy: {
      '/api': {
        target: 'https://api.mateyou.me',
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
