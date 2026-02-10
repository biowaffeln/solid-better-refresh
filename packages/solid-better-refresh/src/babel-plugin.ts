/**
 * babel-plugin-solid-better-refresh
 *
 * Transforms createSignal/createStore calls inside component functions
 * into __hmr_persist wrappers so state persists across HMR updates.
 */

import type { PluginObj, NodePath, types as t } from "@babel/core";

interface PluginState {
  hasInjectedImport: boolean;
  filename: string;
  counters: Map<string, number>;
  componentPrimitiveCounts: Map<string, number>;
  file: { opts: { filename?: string } };
}

export interface BabelPluginOptions {
  primitives?: string[];
}

const DEFAULT_PRIMITIVES: Record<string, string> = {
  createSignal: "signal",
  createStore: "store",
};

export default function solidBetterRefreshBabelPlugin(
  { types: t }: { types: typeof import("@babel/core").types },
  options: BabelPluginOptions = {}
): PluginObj<PluginState> {
  const primitiveMap = options.primitives
    ? { ...DEFAULT_PRIMITIVES, ...Object.fromEntries(options.primitives.map((p) => [p, p])) }
    : DEFAULT_PRIMITIVES;

  /** Build an `import.meta` AST node using the correct metaProperty node type. */
  function importMeta(): t.MetaProperty {
    return t.metaProperty(t.identifier("import"), t.identifier("meta"));
  }

  function findEnclosingComponent(
    path: NodePath
  ): { name: string; node: t.Node } | null {
    let current = path.parentPath;
    // Track whether we've crossed a function boundary that ISN'T the component.
    // If we hit a non-component function before finding a component, the signal
    // is in a nested scope (map callback, event handler, etc.) and we skip it.
    let crossedFunctionBoundary = false;

    while (current) {
      if (current.isFunctionDeclaration()) {
        const name = current.node.id?.name;
        if (name && /^[A-Z]/.test(name)) {
          return crossedFunctionBoundary ? null : { name, node: current.node };
        }
        crossedFunctionBoundary = true;
      }

      // Named function expression: function Foo() { ... }
      // This covers both `const Foo = function Foo() {}` AND
      // solid-refresh's wrapping: `_$component(REG, "Foo", function Foo() {})`
      if (current.isFunctionExpression()) {
        const name = current.node.id?.name;
        if (name && /^[A-Z]/.test(name)) {
          return crossedFunctionBoundary ? null : { name, node: current.node };
        }
        crossedFunctionBoundary = true;
      }

      // Arrow function assigned to PascalCase variable: const Foo = () => { ... }
      if (current.isArrowFunctionExpression()) {
        const parent = current.parentPath;
        if (parent?.isVariableDeclarator()) {
          const id = parent.node.id;
          if (t.isIdentifier(id) && /^[A-Z]/.test(id.name)) {
            return crossedFunctionBoundary ? null : { name: id.name, node: current.node };
          }
        }
        crossedFunctionBoundary = true;
      }

      current = current.parentPath;
    }

    return null;
  }

  function getMatchedPrimitive(
    callee: t.Expression | t.V8IntrinsicIdentifier
  ): string | null {
    if (t.isIdentifier(callee) && callee.name in primitiveMap) {
      return callee.name;
    }
    if (
      t.isMemberExpression(callee) &&
      t.isIdentifier(callee.property) &&
      callee.property.name in primitiveMap
    ) {
      return callee.property.name;
    }
    return null;
  }

  return {
    name: "solid-better-refresh",

    visitor: {
      Program: {
        enter(path, state) {
          state.hasInjectedImport = false;
          state.counters = new Map();
          state.componentPrimitiveCounts = new Map();

          const rawFilename = state.filename || state.file?.opts?.filename || "unknown";
          state.filename = rawFilename.replace(process.cwd(), "").replace(/^\//, "");
        },

        exit(path, state) {
          if (state.hasInjectedImport && state.componentPrimitiveCounts.size > 0) {
            const metadata = Object.fromEntries(state.componentPrimitiveCounts);

            // Build: import.meta.hot?.data
            const hotData = t.optionalMemberExpression(
              t.memberExpression(importMeta(), t.identifier("hot"), false),
              t.identifier("data"),
              false,
              true
            );

            const structureCheck = t.expressionStatement(
              t.callExpression(t.identifier("__hmr_checkStructure"), [
                hotData,
                t.valueToNode(metadata),
              ])
            );

            // Insert right after imports (before any component definitions)
            // so it runs BEFORE __hmr_persist calls during top-to-bottom execution.
            const lastImportIdx = path.node.body.reduce(
              (acc: number, node: t.Statement, i: number) =>
                t.isImportDeclaration(node) ? i : acc,
              -1
            );
            path.node.body.splice(lastImportIdx + 1, 0, structureCheck);
          }
        },
      },

      CallExpression(path, state) {
        const callee = path.node.callee;
        const primitiveName = getMatchedPrimitive(callee);
        if (!primitiveName) return;

        const component = findEnclosingComponent(path);
        if (!component) return;

        const typeCategory = primitiveMap[primitiveName];
        const counterKey = `${component.name}::${typeCategory}`;
        const currentIndex = state.counters.get(counterKey) || 0;
        state.counters.set(counterKey, currentIndex + 1);

        const totalKey = component.name;
        state.componentPrimitiveCounts.set(
          totalKey,
          (state.componentPrimitiveCounts.get(totalKey) || 0) + 1
        );

        const stableKey = `${state.filename}::${component.name}::${typeCategory}::${currentIndex}`;

        // Inject runtime import once per file
        if (!state.hasInjectedImport) {
          const importDecl = t.importDeclaration(
            [
              t.importSpecifier(
                t.identifier("__hmr_persist"),
                t.identifier("__hmr_persist")
              ),
              t.importSpecifier(
                t.identifier("__hmr_checkStructure"),
                t.identifier("__hmr_checkStructure")
              ),
            ],
            t.stringLiteral("virtual:solid-better-refresh")
          );
          const program = path.findParent((p) => p.isProgram()) as NodePath<t.Program>;
          const lastImportIndex = program.node.body.reduce(
            (acc, node, i) => (t.isImportDeclaration(node) ? i : acc),
            -1
          );
          program.node.body.splice(lastImportIndex + 1, 0, importDecl);
          state.hasInjectedImport = true;
        }

        // Build: import.meta.hot
        const importMetaHot = t.memberExpression(
          importMeta(),
          t.identifier("hot"),
          false
        );

        const originalArgs = path.node.arguments;

        // If any argument is a spread, skip transform — we can't safely
        // wrap spread semantics into our array-based persistence.
        if (originalArgs.some((arg) => t.isSpreadElement(arg))) return;

        const argsArray = t.arrayExpression(originalArgs as t.Expression[]);

        const persistArgs: t.Expression[] = [
          importMetaHot,
          t.stringLiteral(stableKey),
          t.isIdentifier(callee)
            ? t.identifier(callee.name)
            : (callee as t.Expression),
          argsArray,
        ];

        // If the component function has a props parameter, pass it through
        // for fingerprint-based instance matching (reorder resilience)
        const fnNode = component.node as t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression;
        if (fnNode.params.length > 0 && t.isIdentifier(fnNode.params[0])) {
          persistArgs.push(t.identifier(fnNode.params[0].name));
        }

        path.replaceWith(
          t.callExpression(t.identifier("__hmr_persist"), persistArgs)
        );

        path.skip();
      },
    },
  };
}
