import '@testing-library/jest-dom/vitest';

// Ensure localStorage works in jsdom
if (typeof window !== 'undefined' && !window.localStorage.getItem) {
  const store: Record<string, string> = {};
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, val: string) => { store[key] = val; },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { Object.keys(store).forEach(k => delete store[k]); },
    },
    writable: true,
  });
}
