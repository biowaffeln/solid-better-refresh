/**
 * solid-better-refresh runtime
 *
 * Browser-side module that persists Solid reactive primitives across HMR.
 * Served as a virtual module by the Vite plugin.
 *
 * This file is built by tsup and read at startup by the vite plugin
 * to serve as the virtual module content.
 */

interface ViteHot {
  data: Record<string, unknown>;
}

type ReactiveFactory = (...args: unknown[]) => unknown;

interface HmrRegistry {
  [key: string]: unknown;
}

interface StructureMap {
  [componentName: string]: number;
}

const REGISTRY_KEY = "__hmr_registry";
const STRUCTURE_KEY = "__hmr_prevStructure";
const INVALIDATED_KEY = "__hmr_invalidated";
const INSTANCE_COUNTERS_KEY = "__hmr_instanceCounters";
const WARNED_AMBIGUOUS_KEY = "__hmr_warnedAmbiguous";

/**
 * Track which hot.data objects have a pending microtask counter reset.
 * After each synchronous render batch completes, the microtask fires
 * and resets instance counters — so the next render (whether triggered
 * by this module's own HMR or a parent's) starts counting from 0.
 */
const pendingResets = new WeakSet<object>();

function scheduleCursorReset(hotData: Record<string, unknown>): void {
  if (!pendingResets.has(hotData)) {
    pendingResets.add(hotData);
    queueMicrotask(() => {
      hotData[INSTANCE_COUNTERS_KEY] = new Map<string, number>();
      pendingResets.delete(hotData);
    });
  }
}

/**
 * Extract the component name from a persist key.
 * Key format: "filename::ComponentName::type::index"
 */
function componentFromKey(key: string): string {
  return key.split("::")[1] ?? "";
}

function isPrimitive(v: unknown): boolean {
  return v == null || (typeof v !== "object" && typeof v !== "function");
}

function hasPrimitiveIdentity(props?: Record<string, unknown>): boolean {
  if (!props || typeof props !== "object") return false;
  if ("id" in props && isPrimitive(props.id)) return true;
  if ("key" in props && isPrimitive(props.key)) return true;
  return false;
}

function isDevMode(): boolean {
  try {
    // Runtime module only ships in dev, but keep this guard explicit.
    return typeof process === "undefined" || process.env.NODE_ENV !== "production";
  } catch {
    return true;
  }
}

function fingerprintProps(props: Record<string, unknown>): string | null {
  if (!props || typeof props !== "object") return null;
  try {
    // Internal call-site identity (injected by transform) has highest priority.
    if ("__hmrSite" in props) {
      const site = props.__hmrSite;
      if (isPrimitive(site)) return `site=${site}`;
    }
    // Fast path: common identity fields
    if ("id" in props) {
      const id = props.id;
      if (isPrimitive(id)) return `id=${id}`;
    }
    if ("key" in props) {
      const k = props.key;
      if (isPrimitive(k)) return `key=${k}`;
    }
    // Slow path: hash all primitive props
    const parts: string[] = [];
    for (const k of Object.keys(props).sort()) {
      try {
        const v = props[k];
        if (isPrimitive(v)) parts.push(`${k}=${v}`);
      } catch {}
    }
    return parts.length > 0 ? parts.join("&") : null;
  } catch {
    return null;
  }
}

export function __hmr_persist(
  hot: ViteHot | undefined | null,
  key: string,
  factory: ReactiveFactory,
  args: unknown[],
  props?: Record<string, unknown>
): unknown {
  if (!hot) {
    return factory(...args);
  }

  // Schedule counter reset after this synchronous render batch
  scheduleCursorReset(hot.data);

  if (!hot.data[REGISTRY_KEY]) {
    hot.data[REGISTRY_KEY] = {};
  }

  const registry = hot.data[REGISTRY_KEY] as HmrRegistry;

  // Build counter key incorporating fingerprint for reorder resilience
  const fingerprint = props ? fingerprintProps(props) : null;
  const counterKey = fingerprint ? `${key}::fp:${fingerprint}` : key;

  // Get/increment instance counter (lazy-init the Map if needed)
  if (!hot.data[INSTANCE_COUNTERS_KEY]) {
    hot.data[INSTANCE_COUNTERS_KEY] = new Map<string, number>();
  }
  const counters = hot.data[INSTANCE_COUNTERS_KEY] as Map<string, number>;
  const instanceNum = counters.get(counterKey) ?? 0;
  counters.set(counterKey, instanceNum + 1);

  const isSiteOnly = !!fingerprint && fingerprint.startsWith("site=");
  const ambiguousByPosition = !fingerprint || (isSiteOnly && !hasPrimitiveIdentity(props));
  // Duplicate instances with positional matching may swap on reorder.
  if (ambiguousByPosition && instanceNum > 0 && isDevMode()) {
    if (!hot.data[WARNED_AMBIGUOUS_KEY]) {
      hot.data[WARNED_AMBIGUOUS_KEY] = new Set<string>();
    }
    const warned = hot.data[WARNED_AMBIGUOUS_KEY] as Set<string>;
    if (!warned.has(counterKey)) {
      warned.add(counterKey);
      console.warn(
        `[solid-better-refresh] ambiguous HMR identity for duplicate instances of "${componentFromKey(key)}". ` +
          `State is positional and may swap after refresh.`
      );
    }
  }

  const instanceKey = `${counterKey}::${instanceNum}`;

  // Check invalidation using static key (component-level)
  const invalidated = hot.data[INVALIDATED_KEY] as Set<string> | null | undefined;
  if (invalidated?.has(componentFromKey(key))) {
    const result = factory(...args);
    registry[instanceKey] = result;
    return result;
  }

  // Restore from cache if available
  if (instanceKey in registry) {
    return registry[instanceKey];
  }

  // Not found — create fresh
  const result = factory(...args);
  registry[instanceKey] = result;
  return result;
}

export function __hmr_checkStructure(
  hotData: Record<string, unknown> | undefined | null,
  structure: StructureMap
): void {
  if (!hotData) return;

  // Reset instance counters for this cycle
  hotData[INSTANCE_COUNTERS_KEY] = new Map<string, number>();

  const prevStructure = hotData[STRUCTURE_KEY] as StructureMap | undefined;

  if (prevStructure) {
    // Find which components changed
    const allComponents = new Set([
      ...Object.keys(prevStructure),
      ...Object.keys(structure),
    ]);

    const changedComponents = new Set<string>();
    for (const name of allComponents) {
      if (prevStructure[name] !== structure[name]) {
        changedComponents.add(name);
      }
    }

    if (changedComponents.size > 0) {
      console.warn(
        `[solid-better-refresh] structure changed for: ${[...changedComponents].join(", ")}\n` +
          `  Previous: ${JSON.stringify(prevStructure)}\n` +
          `  Current:  ${JSON.stringify(structure)}`
      );

      // Clear only registry keys belonging to changed components
      const registry = (hotData[REGISTRY_KEY] ?? {}) as HmrRegistry;
      for (const key of Object.keys(registry)) {
        if (changedComponents.has(componentFromKey(key))) {
          delete registry[key];
        }
      }

      hotData[INVALIDATED_KEY] = changedComponents;
    } else {
      hotData[INVALIDATED_KEY] = null;
    }
  }

  hotData[STRUCTURE_KEY] = structure;
}
