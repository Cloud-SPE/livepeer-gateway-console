/**
 * Generic sessionStorage helpers with key namespacing and JSON wrap.
 * @param {string} namespace e.g. 'gateway.console'
 */
export function createSession(namespace) {
  const key = `${namespace}.session`;
  return {
    get() {
      try {
        const raw = sessionStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },
    /** @param {unknown} value */
    set(value) {
      try {
        sessionStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* quota / disabled */
      }
    },
    clear() {
      try {
        sessionStorage.removeItem(key);
      } catch {
        /* noop */
      }
    },
    has() {
      try {
        return sessionStorage.getItem(key) !== null;
      } catch {
        return false;
      }
    },
  };
}
