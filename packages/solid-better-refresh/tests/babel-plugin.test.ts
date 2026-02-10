import { describe, it, expect } from "vitest";
import * as babel from "@babel/core";
import plugin from "../src/babel-plugin";

function transform(code: string, opts: { primitives?: string[] } = {}) {
  const result = babel.transformSync(code, {
    filename: "/src/App.tsx",
    plugins: [[plugin, opts]],
    parserOpts: { plugins: ["jsx", "typescript"] },
  });
  return result?.code ?? "";
}

describe("babel-plugin-solid-better-refresh", () => {
  describe("basic transforms", () => {
    it("wraps createSignal inside a function declaration component", () => {
      const code = `
        import { createSignal } from "solid-js";
        function App() {
          const [count, setCount] = createSignal(0);
          return count();
        }
      `;
      const output = transform(code);
      expect(output).toContain("__hmr_persist");
      expect(output).toContain("import.meta.hot");
      expect(output).toContain("::signal::");
    });

    it("wraps createStore inside a component", () => {
      const code = `
        import { createStore } from "solid-js/store";
        function App() {
          const [state, setState] = createStore({ count: 0 });
          return state.count;
        }
      `;
      const output = transform(code);
      expect(output).toContain("__hmr_persist");
      expect(output).toContain("::store::");
    });

    it("wraps inside arrow function component", () => {
      const code = `
        import { createSignal } from "solid-js";
        const App = () => {
          const [count, setCount] = createSignal(0);
          return count();
        };
      `;
      const output = transform(code);
      expect(output).toContain("__hmr_persist");
      expect(output).toContain("App");
    });

    it("wraps inside solid-refresh function expression pattern", () => {
      const code = `
        import { createSignal } from "solid-js";
        _$component(_REGISTRY, "App", function App() {
          const [count, setCount] = createSignal(0);
          return count();
        });
      `;
      const output = transform(code);
      expect(output).toContain("__hmr_persist");
    });
  });

  describe("skip cases", () => {
    it("does NOT wrap module-scope signals", () => {
      const code = `
        import { createSignal } from "solid-js";
        const [count, setCount] = createSignal(0);
        function App() {
          return count();
        }
      `;
      const output = transform(code);
      // createSignal at module scope should remain untouched
      expect(output).toContain("createSignal(0)");
      expect(output).not.toContain("__hmr_persist");
    });

    it("does NOT wrap signals in non-PascalCase functions", () => {
      const code = `
        import { createSignal } from "solid-js";
        function helper() {
          const [count, setCount] = createSignal(0);
          return count;
        }
      `;
      const output = transform(code);
      expect(output).toContain("createSignal(0)");
      expect(output).not.toContain("__hmr_persist");
    });

    it("does NOT wrap signals in nested callback scopes (Bug B)", () => {
      const code = `
        import { createSignal } from "solid-js";
        function App() {
          const items = [1, 2, 3];
          return items.map(item => {
            const [checked, setChecked] = createSignal(false);
            return checked();
          });
        }
      `;
      const output = transform(code);
      // The nested createSignal should NOT be transformed
      expect(output).toContain("createSignal(false)");
      expect(output).not.toContain("__hmr_persist");
    });

    it("does NOT wrap signals inside nested function declarations", () => {
      const code = `
        import { createSignal } from "solid-js";
        function App() {
          function handler() {
            const [v, setV] = createSignal(0);
            return v;
          }
          return handler();
        }
      `;
      const output = transform(code);
      expect(output).toContain("createSignal(0)");
      expect(output).not.toContain("__hmr_persist");
    });

    it("does NOT wrap when spread arguments are used (Bug C)", () => {
      const code = `
        import { createSignal } from "solid-js";
        function App() {
          const args = [0];
          const [count, setCount] = createSignal(...args);
          return count();
        }
      `;
      const output = transform(code);
      expect(output).toContain("createSignal(...args)");
    });
  });

  describe("namespace import", () => {
    it("wraps solid.createSignal member expressions", () => {
      const code = `
        import * as solid from "solid-js";
        function App() {
          const [count, setCount] = solid.createSignal(0);
          return count();
        }
      `;
      const output = transform(code);
      expect(output).toContain("__hmr_persist");
    });
  });

  describe("multiple components", () => {
    it("generates separate keys for each component", () => {
      const code = `
        import { createSignal } from "solid-js";
        function Header() {
          const [x, setX] = createSignal(0);
          return x();
        }
        function Footer() {
          const [y, setY] = createSignal(0);
          return y();
        }
      `;
      const output = transform(code);
      expect(output).toContain("Header");
      expect(output).toContain("Footer");
      // Both should be wrapped
      expect(output).not.toContain("createSignal(0)");
    });
  });

  describe("import injection", () => {
    it("injects import from virtual:solid-better-refresh once", () => {
      const code = `
        import { createSignal } from "solid-js";
        function App() {
          const [a, setA] = createSignal(0);
          const [b, setB] = createSignal(1);
          return a() + b();
        }
      `;
      const output = transform(code);
      const importMatches = output.match(/virtual:solid-better-refresh/g);
      expect(importMatches).toHaveLength(1);
    });

    it("places import after last existing import", () => {
      const code = `
        import { createSignal } from "solid-js";
        import { something } from "other";
        function App() {
          const [count, setCount] = createSignal(0);
          return count();
        }
      `;
      const output = transform(code);
      // The hmr import should come after "other" import
      const hmrImportIdx = output.indexOf("virtual:solid-better-refresh");
      const otherImportIdx = output.indexOf('"other"');
      expect(hmrImportIdx).toBeGreaterThan(otherImportIdx);
    });
  });

  describe("structure check placement (Bug A)", () => {
    it("places __hmr_checkStructure BEFORE component definitions", () => {
      const code = `
        import { createSignal } from "solid-js";
        function App() {
          const [count, setCount] = createSignal(0);
          return count();
        }
      `;
      const output = transform(code);
      const checkIdx = output.indexOf("__hmr_checkStructure");
      // There should be two occurrences: the import and the call
      // The call should appear before the function App definition
      const callIdx = output.indexOf("__hmr_checkStructure(import.meta.hot");
      const fnIdx = output.indexOf("function App");
      expect(callIdx).toBeGreaterThan(-1);
      expect(callIdx).toBeLessThan(fnIdx);
    });
  });

  describe("custom primitives", () => {
    it("transforms custom primitives when configured", () => {
      const code = `
        import { createMyState } from "my-lib";
        function App() {
          const state = createMyState(0);
          return state;
        }
      `;
      const output = transform(code, { primitives: ["createMyState"] });
      expect(output).toContain("__hmr_persist");
      expect(output).not.toContain("createMyState(0)");
    });

    it("still transforms default primitives when custom ones are configured", () => {
      const code = `
        import { createSignal } from "solid-js";
        function App() {
          const [count, setCount] = createSignal(0);
          return count();
        }
      `;
      const output = transform(code, { primitives: ["createMyState"] });
      // createSignal is in the defaults and should still be transformed
      expect(output).toContain("__hmr_persist");
      expect(output).not.toContain("createSignal(0)");
    });
  });

  describe("props fingerprinting", () => {
    it("passes props as 5th arg when component has params", () => {
      const code = `
        import { createSignal } from "solid-js";
        function Counter(props) {
          const [count, setCount] = createSignal(0);
          return count();
        }
      `;
      const output = transform(code);
      expect(output).toContain("__hmr_persist");
      // Should end with , props)
      expect(output).toMatch(/,\s*props\)/);
    });

    it("omits props when component has no params", () => {
      const code = `
        import { createSignal } from "solid-js";
        function App() {
          const [count, setCount] = createSignal(0);
          return count();
        }
      `;
      const output = transform(code);
      expect(output).toContain("__hmr_persist");
      // Should NOT end with , props)
      expect(output).not.toMatch(/,\s*props\)/);
    });

    it("handles arrow function with props", () => {
      const code = `
        import { createSignal } from "solid-js";
        const Counter = (props) => {
          const [count, setCount] = createSignal(0);
          return count();
        };
      `;
      const output = transform(code);
      expect(output).toContain("__hmr_persist");
      expect(output).toMatch(/,\s*props\)/);
    });
  });

  describe("structure metadata", () => {
    it("generates correct component primitive counts", () => {
      const code = `
        import { createSignal } from "solid-js";
        import { createStore } from "solid-js/store";
        function App() {
          const [a, setA] = createSignal(0);
          const [b, setB] = createSignal(1);
          const [store, setStore] = createStore({});
          return a() + b();
        }
      `;
      const output = transform(code);
      // App has 3 primitives total (2 signals + 1 store)
      expect(output).toContain("App: 3");
    });
  });
});
