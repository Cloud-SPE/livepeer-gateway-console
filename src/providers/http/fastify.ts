// Fastify provider — the only place `fastify` and its plugins are imported.
// Higher layers consume the `HttpServer` interface and never see Fastify.

import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifySensible from '@fastify/sensible';

export interface HttpServer {
  app: FastifyInstance;
  listen(host: string, port: number): Promise<string>;
  close(): Promise<void>;
}

export interface CreateFastifyServerOptions {
  /** Pino-shaped logger toggle; pass false in tests. */
  logger?: boolean;
}

export async function createFastifyServer(
  options: CreateFastifyServerOptions = {},
): Promise<HttpServer> {
  const app = Fastify({
    logger: options.logger ?? true,
    bodyLimit: 1024 * 1024,
  });
  await app.register(fastifySensible);

  return {
    app,
    listen: async (host, port) => app.listen({ host, port }),
    close: async () => {
      await app.close();
    },
  };
}

export { fastifyStatic };
export type { FastifyInstance };
