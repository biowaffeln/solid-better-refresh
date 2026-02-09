import { describe, it, expect } from "vitest";
import solidBetterRefresh, { solidBetterRefreshVite } from "../src/vite-plugin";
import type { Plugin, ResolvedConfig } from "vite";

// Helper to simulate configResolved on a plugin
function resolvePlugin(plugin: Plugin, command: "serve" | "build" = "serve") {
  if (typeof plugin.configResolved === "function") {
    plugin.configResolved({ command } as ResolvedConfig);
  }
}

describe("solidBetterRefreshVite (runtime plugin)", () => {
  it("resolves the virtual module ID", () => {
    const plugin = solidBetterRefreshVite();
    resolvePlugin(plugin);

    const resolved = (plugin.resolveId as Function)("virtual:solid-better-refresh");
    expect(resolved).toBe("\0virtual:solid-better-refresh");
  });

  it("returns null for non-virtual IDs", () => {
    const plugin = solidBetterRefreshVite();
    resolvePlugin(plugin);

    const resolved = (plugin.resolveId as Function)("./some-file.ts");
    expect(resolved).toBeUndefined();
  });

  it("serves runtime code in dev mode", () => {
    const plugin = solidBetterRefreshVite();
    resolvePlugin(plugin, "serve");

    const code = (plugin.load as Function)("\0virtual:solid-better-refresh");
    expect(code).toContain("__hmr_persist");
    expect(code).toContain("__hmr_checkStructure");
    expect(code).toContain("REGISTRY_KEY");
  });

  it("serves passthrough stub in prod mode", () => {
    const plugin = solidBetterRefreshVite();
    resolvePlugin(plugin, "build");

    const code = (plugin.load as Function)("\0virtual:solid-better-refresh");
    expect(code).toContain("__hmr_persist");
    expect(code).toContain("factory(...args)");
    // Prod stub should not have the caching logic
    expect(code).not.toContain("REGISTRY_KEY");
  });

  it("returns undefined for non-virtual module loads", () => {
    const plugin = solidBetterRefreshVite();
    resolvePlugin(plugin);

    const code = (plugin.load as Function)("./some-file.ts");
    expect(code).toBeUndefined();
  });
});

describe("solidBetterRefresh (full plugin)", () => {
  it("returns an array of two plugins", () => {
    const plugins = solidBetterRefresh();
    expect(plugins).toHaveLength(2);
    expect(plugins[0].name).toBe("solid-better-refresh:runtime");
    expect(plugins[1].name).toBe("solid-better-refresh:transform");
  });

  it("transform plugin has enforce: pre", () => {
    const plugins = solidBetterRefresh();
    expect(plugins[1].enforce).toBe("pre");
  });

  describe("transform filtering", () => {
    function getTransformPlugin(options = {}): Plugin {
      const plugins = solidBetterRefresh(options);
      const transform = plugins[1];
      resolvePlugin(transform, "serve");
      return transform;
    }

    it("skips non-jsx/tsx files", async () => {
      const plugin = getTransformPlugin();
      const result = await (plugin.transform as Function)(
        'import { createSignal } from "solid-js";',
        "/src/utils.ts"
      );
      expect(result).toBeUndefined();
    });

    it("skips node_modules", async () => {
      const plugin = getTransformPlugin();
      const result = await (plugin.transform as Function)(
        'import { createSignal } from "solid-js"; function App() { createSignal(0); }',
        "/node_modules/some-lib/Component.tsx"
      );
      expect(result).toBeUndefined();
    });

    it("skips files without matching primitives", async () => {
      const plugin = getTransformPlugin();
      const result = await (plugin.transform as Function)(
        'function App() { return "hello"; }',
        "/src/App.tsx"
      );
      expect(result).toBeUndefined();
    });

    it("processes .tsx files with createSignal", async () => {
      const plugin = getTransformPlugin();
      const code = `
        import { createSignal } from "solid-js";
        function App() {
          const [count, setCount] = createSignal(0);
          return count();
        }
      `;
      const result = await (plugin.transform as Function)(code, "/src/App.tsx");
      expect(result).toBeDefined();
      expect(result.code).toContain("__hmr_persist");
    });

    it("processes .jsx files", async () => {
      const plugin = getTransformPlugin();
      const code = `
        import { createSignal } from "solid-js";
        function App() {
          const [count, setCount] = createSignal(0);
          return count();
        }
      `;
      const result = await (plugin.transform as Function)(code, "/src/App.jsx");
      expect(result).toBeDefined();
      expect(result.code).toContain("__hmr_persist");
    });

    it("skips in prod mode", async () => {
      const plugins = solidBetterRefresh();
      const transform = plugins[1];
      resolvePlugin(transform, "build");

      const code = `
        import { createSignal } from "solid-js";
        function App() {
          const [count, setCount] = createSignal(0);
          return count();
        }
      `;
      const result = await (transform.transform as Function)(code, "/src/App.tsx");
      expect(result).toBeUndefined();
    });

    it("uses custom primitives for quick-check", async () => {
      const plugin = getTransformPlugin({ primitives: ["createMyState"] });

      // Should still process files with default primitives (merge behavior)
      const result1 = await (plugin.transform as Function)(
        'import { createSignal } from "solid-js"; function App() { createSignal(0); }',
        "/src/App.tsx"
      );
      expect(result1).toBeDefined();

      // Should process files with custom primitive
      const code = `
        import { createMyState } from "my-lib";
        function App() {
          const state = createMyState(0);
          return state;
        }
      `;
      const result2 = await (plugin.transform as Function)(code, "/src/App.tsx");
      expect(result2).toBeDefined();
      expect(result2.code).toContain("__hmr_persist");
    });
  });
});
