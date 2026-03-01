import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { Capacitor } from '@capacitor/core'
import { SafeArea } from '@capacitor-community/safe-area'

import { ConfirmProvider } from './hooks/useConfirm'
import * as TanStackQueryProvider from './integrations/tanstack-query/root-provider.tsx'
import { useAuthStore } from './store/useAuthStore'

// Import the generated route tree
import { routeTree } from './routeTree.gen'

import { initDevToolsProtection } from './lib/devToolsProtection'
import reportWebVitals from './reportWebVitals.ts'
import './styles.css'
import { initializeFavicon } from './utils/favicon'

// Capacitor SafeArea 플러그인 초기화 - Android만 사용 (iOS는 MyViewController에서 처리)
if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
  SafeArea.enable({
    config: {
      customColorsForSystemBars: true,
      statusBarColor: '#FE3A8F', // 핑크색
      statusBarContent: 'light', // 밝은 아이콘
      navigationBarColor: '#000000', // 검은색
      navigationBarContent: 'light', // 밝은 아이콘
    },
  }).catch(console.error)
}

// Create a new router instance

const TanStackQueryProviderContext = TanStackQueryProvider.getContext()
const router = createRouter({
  routeTree,
  context: {
    ...TanStackQueryProviderContext,
  },
  defaultPreload: 'intent',
  scrollRestoration: true,
  defaultStructuralSharing: true,
  defaultPreloadStaleTime: 0,
})

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// Initialize auth store
useAuthStore.getState().initialize()

// Initialize dynamic favicon
initializeFavicon()

// Initialize dev tools protection (PC web only, production only)
initDevToolsProtection()

// Render the app
const rootElement = document.getElementById('app')
if (rootElement && !rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <StrictMode>
      <TanStackQueryProvider.Provider {...TanStackQueryProviderContext}>
        <ConfirmProvider>
          <RouterProvider router={router} />
        </ConfirmProvider>
      </TanStackQueryProvider.Provider>
    </StrictMode>,
  )
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals()
