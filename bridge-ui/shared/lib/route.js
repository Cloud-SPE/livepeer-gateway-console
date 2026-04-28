/**
 * Hash-based router. Returns the current hash path (without the leading
 * `#`, defaulting to `/`) and lets components subscribe to changes.
 *
 * Ported from livepeer-orch-coordinator per FRONTEND.md.
 */

/** @returns {string} The current hash path, e.g. "/orchs/0xabc...". */
export function current() {
  const raw = window.location.hash;
  if (!raw || raw === '#') return '/';
  return raw.startsWith('#') ? raw.slice(1) : raw;
}

/**
 * Subscribe to hash changes. The handler is called once with the current
 * path (microtask-deferred), then on every subsequent change. Returns an
 * unsubscribe function — push into `this._unsubs` and call on disconnect.
 *
 * @param {(path: string) => void} handler
 * @returns {() => void}
 */
export function onChange(handler) {
  const wrapped = () => handler(current());
  window.addEventListener('hashchange', wrapped);
  queueMicrotask(() => handler(current()));
  return () => window.removeEventListener('hashchange', wrapped);
}

/** @param {string} path e.g. "/sender" or "/orchs/0xabc..." */
export function navigate(path) {
  window.location.hash = path.startsWith('/') ? path : `/${path}`;
}
