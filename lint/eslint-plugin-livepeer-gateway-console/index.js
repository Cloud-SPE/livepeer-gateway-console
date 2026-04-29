// Local ESLint plugin — ships the six architectural lints for the
// gateway-console. Adapted from livepeer-orch-coordinator per Plan 0013 §D.
// Error messages embed remediation hints so a developer reading just the
// lint failure has enough context to act (per the openai-harness PDF).
import layerCheck from "./rules/layer-check.js";
import noCrossCuttingImport from "./rules/no-cross-cutting-import.js";
import zodAtBoundary from "./rules/zod-at-boundary.js";
import noSecretsInLogs from "./rules/no-secrets-in-logs.js";
import fileSize from "./rules/file-size.js";
import typesShape from "./rules/types-shape.js";

export default {
  meta: { name: "eslint-plugin-livepeer-gateway-console", version: "0.0.0" },
  rules: {
    "layer-check": layerCheck,
    "no-cross-cutting-import": noCrossCuttingImport,
    "zod-at-boundary": zodAtBoundary,
    "no-secrets-in-logs": noSecretsInLogs,
    "file-size": fileSize,
    "types-shape": typesShape,
  },
};
