/**
 * gateway-console-namespaced CustomEvent helpers.
 */
export const GATEWAY_EVENTS = Object.freeze({
  AUTHENTICATED: 'gateway-console:authenticated',
  UNAUTHORIZED: 'gateway-console:unauthorized',
});

/** @param {string} name @param {unknown} [detail] */
export function emit(name, detail) {
  window.dispatchEvent(new CustomEvent(name, detail !== undefined ? { detail } : undefined));
}

/** @param {string} name @param {(detail: unknown) => void} handler */
export function on(name, handler) {
  const wrapped = (e) => handler(e instanceof CustomEvent ? e.detail : undefined);
  window.addEventListener(name, wrapped);
  return () => window.removeEventListener(name, wrapped);
}
