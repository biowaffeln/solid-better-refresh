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

/**
 * Extract the component name from a persist key.
 * Key format: "filename::ComponentName::type::index"
 */
function componentFromKey(key: string): string {
  return key.split("::")[1] ?? "";
}

export function __hmr_persist(
  hot: ViteHot | undefined | null,
  key: string,
  factory: ReactiveFactory,
  args: unknown[]
): unknown {
  if (!hot) {
    return factory(...args);
  }

  if (!hot.data[REGISTRY_KEY]) {
    hot.data[REGISTRY_KEY] = {};
  }

  const registry = hot.data[REGISTRY_KEY] as HmrRegistry;
  const invalidated = hot.data[INVALIDATED_KEY] as Set<string> | null | undefined;

  if (invalidated && invalidated.has(componentFromKey(key))) {
    const result = factory(...args);
    registry[key] = result;
    return result;
  }

  if (key in registry) {
    return registry[key];
  }

  const result = factory(...args);
  registry[key] = result;
  return result;
}

export function __hmr_checkStructure(
  hotData: Record<string, unknown> | undefined | null,
  structure: StructureMap
): void {
  if (!hotData) return;

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
