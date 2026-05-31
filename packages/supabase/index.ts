import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Node.js 25 exposes a broken global localStorage when Next.js passes
// --localstorage-file without a valid path. Supabase calls localStorage.getItem
// during client init, causing a 500. We supply a no-op storage adapter so
// Supabase never touches the real localStorage at all (server or client).
const noopStorage = {
  getItem: (_key: string): string | null => null,
  setItem: (_key: string, _value: string): void => {},
  removeItem: (_key: string): void => {},
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    storage: noopStorage,
  },
})
