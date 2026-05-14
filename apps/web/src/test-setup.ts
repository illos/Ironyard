import '@testing-library/jest-dom/vitest';

// Node 25 ships an experimental built-in `localStorage` global. When
// jsdom installs its own implementation on `window`, the Node 25 one
// leaks through (or jsdom's getter loses to the global), and the result
// is a localStorage object with no methods. Force-install a fresh
// in-memory shim so component code that touches localStorage works in
// tests (e.g. useActiveContext).
{
  const store = new Map<string, string>();
  const shim: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? (store.get(key) as string) : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(window, 'localStorage', {
    value: shim,
    writable: true,
    configurable: true,
  });
}
