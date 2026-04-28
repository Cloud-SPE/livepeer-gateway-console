// Scans log-call arguments for identifiers / object-keys that match a
// denylist of secret-bearing names. Catches the classic "accidentally logged
// the bearer token" footgun.
//
// Log calls considered: console.log/warn/error/info/debug, req.log.<level>,
// logger.<level>, reply.log.<level>.
//
// Remediation hint embedded in the error message.

const SECRET_PATTERNS = [
  /^api[_-]?key$/i,
  /^admin[_-]?token$/i,
  /^bearer$/i,
  /^private[_-]?key$/i,
  /^keystore$/i,
  /^passphrase$/i,
  /^password$/i,
  /^secret$/i,
  /^webhook[_-]?secret$/i,
  /^signature$/i,
];

function isSecretName(name) {
  return SECRET_PATTERNS.some((r) => r.test(name));
}

function isLogCall(node) {
  if (node.type !== 'CallExpression') return false;
  const callee = node.callee;
  if (callee.type !== 'MemberExpression') return false;
  if (callee.property.type !== 'Identifier') return false;
  const method = callee.property.name;
  if (!['log', 'warn', 'error', 'info', 'debug', 'trace'].includes(method)) return false;
  let obj = callee.object;
  while (obj && obj.type === 'MemberExpression') obj = obj.object;
  if (obj && obj.type === 'Identifier') {
    const name = obj.name;
    return name === 'console' || name === 'logger' || name === 'req' || name === 'reply';
  }
  return false;
}

function checkExpression(expr, context) {
  if (!expr) return;
  if (expr.type === 'Identifier') {
    if (isSecretName(expr.name)) {
      context.report({ node: expr, messageId: 'identifier', data: { name: expr.name } });
    }
    return;
  }
  if (expr.type === 'ObjectExpression') {
    for (const prop of expr.properties) {
      if (prop.type !== 'Property') continue;
      const keyName =
        prop.key.type === 'Identifier'
          ? prop.key.name
          : prop.key.type === 'Literal' && typeof prop.key.value === 'string'
            ? prop.key.value
            : null;
      if (keyName && isSecretName(keyName)) {
        context.report({ node: prop.key, messageId: 'key', data: { name: keyName } });
      }
      checkExpression(prop.value, context);
    }
    return;
  }
  if (expr.type === 'MemberExpression') {
    if (expr.property.type === 'Identifier' && isSecretName(expr.property.name)) {
      context.report({
        node: expr.property,
        messageId: 'identifier',
        data: { name: expr.property.name },
      });
    }
  }
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Reject passing known-secret names or object keys to log calls (console, logger, req.log, reply.log).',
    },
    schema: [],
    messages: {
      identifier:
        'Do not pass `{{name}}` to a log call — this name pattern matches a known secret. Remediation: redact (`{{name}}: "[redacted]"`) or omit the field entirely. If the value is genuinely safe to log (e.g. a public address, not a private key), rename the variable so it does not match the secret-name regex.',
      key: 'Object key `{{name}}` looks like a secret. Remediation: drop this key from the log payload, or replace its value with a redaction marker like `"[redacted]"`. Logging the secret name even with a redacted value still hints at presence — prefer omission.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!isLogCall(node)) return;
        for (const arg of node.arguments) checkExpression(arg, context);
      },
    };
  },
};
