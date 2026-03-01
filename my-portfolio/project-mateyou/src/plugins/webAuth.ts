import { registerPlugin } from '@capacitor/core'

interface WebAuthPlugin {
  authenticate(options: { url: string; callbackScheme?: string }): Promise<{ url: string }>
}

const WebAuth = registerPlugin<WebAuthPlugin>('WebAuth')

export { WebAuth }







