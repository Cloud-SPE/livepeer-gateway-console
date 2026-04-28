// Warn at 400 source lines, error at 600. A ratchet against the long-file
// anti-pattern. Test files and generated code are exempt.
//
// Remediation hint embedded in the error message.

const WARN_AT = 400;
const ERROR_AT = 600;

export default {
  meta: {
    type: 'suggestion',
    docs: { description: 'File size guardrail: warn at 400 lines, error at 600.' },
    schema: [],
    messages: {
      warn: 'File has {{lines}} lines (warning at {{warnAt}}). Remediation: split when this exceeds {{errorAt}}. Common splits: extract domain logic into a sibling file in the same layer, hoist Zod schemas into `src/types/`, or move provider wiring into a `factory.ts` next to the consumer.',
      error:
        'File has {{lines}} lines (error at {{errorAt}}); split before landing. Remediation: 1) extract pure helpers into `src/utils/`. 2) split a multi-handler runtime file into one file per handler. 3) lift schemas into `src/types/`. 4) move provider wiring into a `factory.ts`.',
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (filename.endsWith('.test.ts')) return {};
    if (filename.includes('/gen/')) return {};
    const src = context.sourceCode.getText();
    const lines = src.split(/\r?\n/).length;

    return {
      Program(node) {
        if (lines >= ERROR_AT) {
          context.report({
            node,
            messageId: 'error',
            data: { lines, errorAt: ERROR_AT },
          });
        } else if (lines >= WARN_AT) {
          context.report({
            node,
            messageId: 'warn',
            data: { lines, warnAt: WARN_AT, errorAt: ERROR_AT },
          });
        }
      },
    };
  },
};
