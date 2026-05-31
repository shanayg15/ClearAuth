/**
 * Next.js instrumentation hook — runs once at server startup, before any
 * requests are handled.
 *
 * Problem: some sandboxed Node builds expose a global `localStorage` object when
 * Next.js passes `--localstorage-file` without a valid path. The object exists
 * (typeof === 'object') but its methods (getItem, setItem, …) are undefined, not
 * functions. Next.js's react-dev-overlay checks `typeof localStorage === 'undefined'`
 * (false), then calls `localStorage.getItem(...)`, throwing
 * "TypeError: localStorage.getItem is not a function" and crashing every SSR
 * render with HTTP 500 under `next dev`.
 *
 * Fix: replace the broken localStorage with a safe in-memory adapter so all
 * callers see a properly shaped Storage object. Mirrors apps/api and
 * apps/dashboard so the portal pages render under `npm run dev`.
 */
export async function register() {
  if (
    typeof globalThis.localStorage === "object" &&
    typeof (globalThis.localStorage as Storage)?.getItem !== "function"
  ) {
    const store: Record<string, string> = {};
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        for (const k in store) delete store[k];
      },
      key: (index: number) => Object.keys(store)[index] ?? null,
      get length() {
        return Object.keys(store).length;
      },
    };
  }
}
