// Enforces the `types → config → repo → service → runtime → ui` dependency
// stack from DESIGN.md. `providers/` and `utils/` are reachable from every
// layer; everything else obeys the partial order strictly.
//
// Remediation hint embedded in the error message: developers reading the
// lint failure should know HOW to fix it without leaving the editor.

const LAYER_ORDER = ["types", "config", "repo", "service", "runtime", "ui"];

/** Classify a file path relative to src/ into a layer name (or null). */
function layerOf(filename) {
  const m = filename.match(/\/src\/([^/]+)\//);
  if (!m) return null;
  const top = m[1];
  if (top === "providers" || top === "utils") return top;
  if (LAYER_ORDER.includes(top)) return top;
  return null;
}

function layerRank(layer) {
  return LAYER_ORDER.indexOf(layer);
}

/** Resolve an import spec relative to src/ into a layer name, or null for
 *  external packages / non-src imports. */
function importTargetLayer(currentFile, spec) {
  if (!spec.startsWith("./") && !spec.startsWith("../")) return null;
  const cwd = currentFile.replace(/\/[^/]+$/, "");
  const parts = cwd.split("/").concat(spec.split("/"));
  const resolved = [];
  for (const p of parts) {
    if (p === "" || p === ".") continue;
    if (p === "..") {
      resolved.pop();
    } else {
      resolved.push(p);
    }
  }
  const srcIdx = resolved.indexOf("src");
  if (srcIdx === -1) return null;
  const top = resolved[srcIdx + 1];
  if (!top) return null;
  if (top === "providers" || top === "utils") return top;
  if (LAYER_ORDER.includes(top)) return top;
  return null;
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Enforce the src/ layer stack: types → config → repo → service → runtime → ui, plus providers/ and utils/ reachable from all.",
    },
    schema: [],
    messages: {
      upstream:
        "File in layer `{{from}}` must not import from layer `{{to}}`. Layers flow types → config → repo → service → runtime → ui; a layer may only depend on layers strictly below it (plus providers/ and utils/). Remediation: invert the dependency — move shared types into `src/types/`, or compose the higher layer in the layer above (typically `runtime/` wires `service/` which calls `repo/`). If the dependency is genuinely cross-cutting, lift the implementation into `src/providers/` and import the provider interface.",
      crossDomain:
        "Cross-domain import inside `service/`: `{{fromDomain}}` cannot import from sibling domain `{{toDomain}}`. Remediation: compose both domains in the layer above (`runtime/` wires `routing` and `sender` together) instead of giving one direct knowledge of the other.",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (filename.endsWith(".test.ts")) return {};
    const fromLayer = layerOf(filename);

    return {
      ImportDeclaration(node) {
        if (!fromLayer) return;
        const spec = node.source.value;
        if (typeof spec !== "string") return;
        const toLayer = importTargetLayer(filename, spec);
        if (!toLayer) return;
        if (toLayer === "providers" || toLayer === "utils") return;
        if (fromLayer === "providers" || fromLayer === "utils") return;

        const fromRank = layerRank(fromLayer);
        const toRank = layerRank(toLayer);
        if (toRank > fromRank) {
          context.report({
            node: node.source,
            messageId: "upstream",
            data: { from: fromLayer, to: toLayer },
          });
          return;
        }
        if (fromLayer === "service" && toLayer === "service") {
          const fromDomain =
            filename.match(/\/src\/service\/([^/]+)\//)?.[1] ?? "";
          const specMatch = spec.match(/\/service\/([^/]+)\//);
          const toDomain = specMatch?.[1];
          if (fromDomain && toDomain && fromDomain !== toDomain) {
            context.report({
              node: node.source,
              messageId: "crossDomain",
              data: { fromDomain, toDomain },
            });
          }
        }
      },
    };
  },
};
