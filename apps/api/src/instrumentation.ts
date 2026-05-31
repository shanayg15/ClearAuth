/**
 * Next.js instrumentation hook — runs once at server startup, before any
 * requests are handled.
 *
 * Problem: Node.js 25 exposes a global `localStorage` object when Next.js
 * passes `--localstorage-file` without a valid path.  The object exists
 * (typeof === 'object') but its methods (getItem, setItem, …) are undefined,
 * not functions.  Next.js's own react-dev-overlay code checks
 * `typeof localStorage === 'undefined'` (which is false), then immediately
 * calls `localStorage.getItem(...)`, throwing
 * "TypeError: localStorage.getItem is not a function" and crashing every SSR
 * render with HTTP 500.
 *
 * Fix: Replace the broken localStorage with a safe in-memory adapter so all
 * callers see a properly shaped Storage object.
 */
export async function register() {
  if (
    typeof globalThis.localStorage === 'object' &&
    typeof (globalThis.localStorage as Storage).getItem !== 'function'
  ) {
    const store: Record<string, string> = {}
    ;(globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value
      },
      removeItem: (key: string) => {
        delete store[key]
      },
      clear: () => {
        for (const k in store) delete store[k]
      },
      key: (index: number) => Object.keys(store)[index] ?? null,
      get length() {
        return Object.keys(store).length
      },
    }
  }
}
