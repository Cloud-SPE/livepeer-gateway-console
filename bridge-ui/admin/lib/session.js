import { createSession } from "../../shared/lib/session-storage.js";

const session = createSession("gateway.console");

export function getToken() {
  const v = session.get();
  return v && typeof v === "object" && typeof v.token === "string"
    ? v.token
    : null;
}

export function getActor() {
  const v = session.get();
  return v && typeof v === "object" && typeof v.actor === "string"
    ? v.actor
    : null;
}

/** @param {string} token @param {string} actor */
export function setSession(token, actor) {
  session.set({ token, actor });
}

export function clearSession() {
  session.clear();
}
