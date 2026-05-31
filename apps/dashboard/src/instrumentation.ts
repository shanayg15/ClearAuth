export async function register() {
  const g = globalThis as unknown as Record<string, unknown>;
  if (process.env.NEXT_RUNTIME === "nodejs" && typeof (g.localStorage as Record<string, unknown> | undefined)?.["getItem"] !== "function") {
    const store: Record<string, string> = {};
    (globalThis as unknown as Record<string, unknown>).localStorage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
      clear: () => { Object.keys(store).forEach(k => delete store[k]); },
      key: (i: number) => Object.keys(store)[i] ?? null,
      get length() { return Object.keys(store).length; },
    };
  }
}
