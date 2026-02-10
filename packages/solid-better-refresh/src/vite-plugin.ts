/**
 * vite-plugin-solid-better-refresh
 *
 * Vite plugin that serves the HMR state runtime as a virtual module
 * and auto-injects the Babel transform before vite-plugin-solid runs.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import babelPluginSolidBetterRefresh from "./babel-plugin";

export interface SolidBetterRefreshOptions {
  primitives?: string[];
  verbose?: boolean;
}

const VIRTUAL_MODULE_ID = "virtual:solid-better-refresh";
const RESOLVED_VIRTUAL_MODULE_ID = "\0" + VIRTUAL_MODULE_ID;

// Load the built runtime JS at module load time.
// Falls back to an inline version if the file doesn't exist (e.g. during dev of this package itself).
let RUNTIME_CODE: string;
try {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  RUNTIME_CODE = readFileSync(join(__dirname, "runtime.js"), "utf-8");
} catch {
  // Fallback inline runtime for when built file isn't available
  RUNTIME_CODE = `
const REGISTRY_KEY = "__hmr_registry";
const STRUCTURE_KEY = "__hmr_prevStructure";
const INVALIDATED_KEY = "__hmr_invalidated";
const INSTANCE_COUNTERS_KEY = "__hmr_instanceCounters";

const pendingResets = new WeakSet();
function scheduleCursorReset(hotData) {
  if (!pendingResets.has(hotData)) {
    pendingResets.add(hotData);
    queueMicrotask(() => {
      hotData[INSTANCE_COUNTERS_KEY] = new Map();
      pendingResets.delete(hotData);
    });
  }
}

function componentFromKey(key) {
  return key.split("::")[1] || "";
}

function isPrimitive(v) {
  return v == null || (typeof v !== "object" && typeof v !== "function");
}

function fingerprintProps(props) {
  if (!props || typeof props !== "object") return null;
  try {
    if ("id" in props) { const id = props.id; if (isPrimitive(id)) return "id=" + id; }
    if ("key" in props) { const k = props.key; if (isPrimitive(k)) return "key=" + k; }
    const parts = [];
    for (const k of Object.keys(props).sort()) {
      try { const v = props[k]; if (isPrimitive(v)) parts.push(k + "=" + v); } catch {}
    }
    return parts.length > 0 ? parts.join("&") : null;
  } catch { return null; }
}

export function __hmr_persist(hot, key, factory, args, props) {
  if (!hot) return factory(...args);

  scheduleCursorReset(hot.data);

  if (!hot.data[REGISTRY_KEY]) hot.data[REGISTRY_KEY] = {};
  const registry = hot.data[REGISTRY_KEY];

  const fingerprint = props ? fingerprintProps(props) : null;
  const counterKey = fingerprint ? key + "::fp:" + fingerprint : key;

  if (!hot.data[INSTANCE_COUNTERS_KEY]) hot.data[INSTANCE_COUNTERS_KEY] = new Map();
  const counters = hot.data[INSTANCE_COUNTERS_KEY];
  const instanceNum = counters.get(counterKey) ?? 0;
  counters.set(counterKey, instanceNum + 1);

  const instanceKey = counterKey + "::" + instanceNum;

  const invalidated = hot.data[INVALIDATED_KEY];
  if (invalidated && invalidated.has(componentFromKey(key))) {
    const result = factory(...args);
    registry[instanceKey] = result;
    return result;
  }

  if (instanceKey in registry) return registry[instanceKey];

  const result = factory(...args);
  registry[instanceKey] = result;
  return result;
}

export function __hmr_checkStructure(hotData, structure) {
  if (!hotData) return;

  hotData[INSTANCE_COUNTERS_KEY] = new Map();

  const prev = hotData[STRUCTURE_KEY];
  if (prev) {
    const allComponents = new Set([...Object.keys(prev), ...Object.keys(structure)]);
    const changed = new Set();
    for (const name of allComponents) {
      if (prev[name] !== structure[name]) changed.add(name);
    }
    if (changed.size > 0) {
      console.warn("[solid-better-refresh] structure changed for: " + [...changed].join(", "));
      const registry = hotData[REGISTRY_KEY] || {};
      for (const key of Object.keys(registry)) {
        if (changed.has(componentFromKey(key))) delete registry[key];
      }
      hotData[INVALIDATED_KEY] = changed;
    } else {
      hotData[INVALIDATED_KEY] = null;
    }
  }
  hotData[STRUCTURE_KEY] = structure;
}
`;
}

const PROD_STUB = `
export function __hmr_persist(hot, key, factory, args, props) {
  return factory(...args);
}
export function __hmr_checkStructure() {}
`;

/**
 * Minimal Vite plugin that only serves the virtual runtime module.
 */
export function solidBetterRefreshVite(): Plugin {
  let isDev = false;

  return {
    name: "solid-better-refresh:runtime",

    configResolved(config) {
      isDev = config.command === "serve";
    },

    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) {
        return RESOLVED_VIRTUAL_MODULE_ID;
      }
    },

    load(id) {
      if (id === RESOLVED_VIRTUAL_MODULE_ID) {
        return isDev ? RUNTIME_CODE : PROD_STUB;
      }
    },
  };
}

/**
 * Full Vite plugin: serves runtime + auto-injects Babel transform.
 */
export default function solidBetterRefresh(options: SolidBetterRefreshOptions = {}): Plugin[] {
  let isDev = false;
  const quickCheckNames = options.primitives?.length
    ? ["createSignal", "createStore", ...options.primitives]
    : ["createSignal", "createStore"];

  return [
    solidBetterRefreshVite(),

    {
      name: "solid-better-refresh:transform",
      enforce: "pre",

      configResolved(config) {
        isDev = config.command === "serve";
      },

      async transform(code, id) {
        if (!isDev) return;
        if (!/\.[jt]sx$/.test(id)) return;
        if (id.includes("node_modules")) return;

        if (!quickCheckNames.some((name) => code.includes(name))) return;

        const babel = await import("@babel/core");

        const result = await babel.transformAsync(code, {
          filename: id,
          plugins: [[babelPluginSolidBetterRefresh, options]],
          parserOpts: {
            plugins: ["jsx", "typescript"],
          },
          retainLines: true,
          sourceMaps: true,
        });

        if (!result?.code) return;

        return {
          code: result.code,
          map: result.map,
        };
      },
    },
  ];
}
