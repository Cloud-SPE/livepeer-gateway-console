// Fastify request augmentation: every /api/* request carries the validated
// actor handle parsed from X-Actor in the onRequest hook in ./server.ts.
// Empty string until set; the hook 400s before any handler runs if missing
// or malformed.

declare module 'fastify' {
  interface FastifyRequest {
    actor: string;
  }
}

export {};
