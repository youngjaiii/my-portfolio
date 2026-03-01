import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl) {
  throw new Error('Missing VITE_SUPABASE_URL environment variable')
}

if (!supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_ANON_KEY environment variable')
}

// Lazy initialization to avoid initialization order issues
// createClient is called only when supabase is actually accessed
let _supabase: SupabaseClient<Database> | null = null

function getSupabaseClient(): SupabaseClient<Database> {
  if (!_supabase) {
    _supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Accept: 'application/json',
          // Content-Type은 GET 요청에서는 불필요하므로 제거 (406 에러 방지)
          // 'Content-Type': 'application/json',
          // Prefer 헤더 제거 (406 에러 방지)
          // Prefer: 'return=representation',
        },
      },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'mate_you_auth',
      },
      db: {
        schema: 'public',
      },
    })
  }
  return _supabase
}

// Export as a Proxy to ensure lazy initialization
// createClient is only called when a property is accessed
export const supabase = new Proxy({} as SupabaseClient<Database>, {
  get(_target, prop) {
    return getSupabaseClient()[prop as keyof SupabaseClient<Database>]
  },
})
