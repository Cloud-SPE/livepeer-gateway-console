// Forbids importing cross-cutting libraries (better-sqlite3, fastify, viem,
// pino, @grpc/*, etc.) outside src/providers/. The whole point of the
// providers layer is to be the one place these libraries leak in.
//
// Remediation hint embedded in the error message.

const FORBIDDEN = new Set([
  'better-sqlite3',
  'fastify',
  'fastify-raw-body',
  '@fastify/sensible',
  '@fastify/static',
  '@fastify/multipart',
  'viem',
  'ethers',
  'pino',
]);

const FORBIDDEN_PREFIXES = ['@grpc/', 'viem/'];

function isForbidden(spec) {
  if (FORBIDDEN.has(spec)) return true;
  for (const p of FORBIDDEN_PREFIXES) {
    if (spec.startsWith(p)) return true;
  }
  return false;
}

function isExempt(filename) {
  return (
    filename.includes('/src/providers/') ||
    filename.endsWith('/src/main.ts') ||
    filename.endsWith('.test.ts')
  );
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Cross-cutting libraries (better-sqlite3, fastify/@fastify/*, viem, ethers, pino, @grpc/*) must only be imported from src/providers/. Everything else imports the provider interface.',
    },
    schema: [],
    messages: {
      forbidden:
        'Cross-cutting library `{{spec}}` may only be imported under src/providers/. Remediation: 1) if `src/providers/<name>.ts` already exists, import its interface instead. 2) if not, create one — wrap `{{spec}}` in a thin abstraction that exposes only the methods this codebase needs, then import that interface here. Keeping these libraries pinned to providers/ is what lets us swap implementations and keeps tests free of network/DB dependencies.',
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (isExempt(filename)) return {};
    if (!filename.includes('/src/')) return {};

    return {
      ImportDeclaration(node) {
        if (node.importKind === 'type') return;
        const spec = node.source.value;
        if (typeof spec !== 'string') return;
        if (!isForbidden(spec)) return;
        if (
          node.specifiers.length > 0 &&
          node.specifiers.every((s) => s.type === 'ImportSpecifier' && s.importKind === 'type')
        ) {
          return;
        }
        context.report({ node: node.source, messageId: 'forbidden', data: { spec } });
      },
    };
  },
};
