// Pino logger provider. The rest of the codebase imports the `Logger`
// interface from here and never touches `pino` directly.

import pino from "pino";

export interface Logger {
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
  debug(msg: string, ctx?: Record<string, unknown>): void;
}

export interface LoggerOptions {
  level: "debug" | "info" | "warn" | "error";
  format: "json" | "text";
}

export function createLogger(options: LoggerOptions): Logger {
  // exactOptionalPropertyTypes: don't pass `transport: undefined`; build the
  // options object so the key is omitted entirely in JSON-format mode.
  const pinoOptions: pino.LoggerOptions = { level: options.level };
  if (options.format === "text") {
    pinoOptions.transport = {
      target: "pino-pretty",
      options: { colorize: true },
    };
  }
  const base = pino(pinoOptions);
  return {
    info: (msg, ctx) => base.info(ctx ?? {}, msg),
    warn: (msg, ctx) => base.warn(ctx ?? {}, msg),
    error: (msg, ctx) => base.error(ctx ?? {}, msg),
    debug: (msg, ctx) => base.debug(ctx ?? {}, msg),
  };
}
