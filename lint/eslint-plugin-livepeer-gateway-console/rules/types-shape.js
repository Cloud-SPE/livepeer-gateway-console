// Every file in src/types/ (other than index.ts and *.test.ts) must export
// both a Zod schema (named `*Schema`) AND a TS type derived from it.
// Convention is mechanically enforced.
//
// Remediation hint embedded in the error message.

function isTypesFile(filename) {
  return (
    filename.includes("/src/types/") &&
    !filename.endsWith("/index.ts") &&
    !filename.endsWith(".test.ts")
  );
}

function isSchemaName(name) {
  return /Schema$/.test(name);
}

function isInferredType(node) {
  if (node.type !== "ExportNamedDeclaration") return false;
  const decl = node.declaration;
  if (!decl || decl.type !== "TSTypeAliasDeclaration") return false;
  const ann = decl.typeAnnotation;
  if (!ann) return false;
  if (ann.type !== "TSTypeReference") return false;
  const name = ann.typeName;
  if (name.type !== "TSQualifiedName") return false;
  if (name.left.type !== "Identifier" || name.left.name !== "z") return false;
  if (name.right.type !== "Identifier") return false;
  return ["infer", "input", "output"].includes(name.right.name);
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Every src/types/*.ts must export both a Zod schema (named `*Schema`) and at least one inferred TS type (`z.infer<typeof X>`).",
    },
    schema: [],
    messages: {
      missingSchema:
        "`src/types/` file does not export a Zod schema (any `export const *Schema`). Remediation: define the schema as the source of truth, e.g. `export const FooSchema = z.object({ ... });`. Files in `src/types/` exist precisely to host these.",
      missingType:
        "`src/types/` file does not export any `z.infer<typeof X>` / `z.input<typeof X>` / `z.output<typeof X>` type alias. Remediation: derive a type from the schema, e.g. `export type Foo = z.infer<typeof FooSchema>;`. Schema and inferred-type stay in lockstep — never define a parallel `type Foo = { ... }` by hand.",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (!isTypesFile(filename)) return {};

    let sawSchema = false;
    let sawInferred = false;

    return {
      ExportNamedDeclaration(node) {
        if (
          node.declaration &&
          node.declaration.type === "VariableDeclaration"
        ) {
          for (const d of node.declaration.declarations) {
            if (d.id.type === "Identifier" && isSchemaName(d.id.name))
              sawSchema = true;
          }
        }
        if (node.specifiers) {
          for (const spec of node.specifiers) {
            if (
              spec.type === "ExportSpecifier" &&
              spec.exported.type === "Identifier" &&
              isSchemaName(spec.exported.name)
            ) {
              sawSchema = true;
            }
          }
        }
        if (isInferredType(node)) sawInferred = true;
      },
      "Program:exit"(node) {
        if (!sawSchema) context.report({ node, messageId: "missingSchema" });
        if (!sawInferred) context.report({ node, messageId: "missingType" });
      },
    };
  },
};
