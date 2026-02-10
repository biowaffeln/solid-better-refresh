# Solid Better Refresh

Persist `createSignal` and `createStore` state across hot module replacements in SolidJS.

When you edit a component and save, normally all state resets. This plugin keeps your signals and stores alive across HMR updates, so you don't lose your app state while developing.

## Install

```bash
npm install -D solid-better-refresh
```

## Setup

```ts
// vite.config.ts
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import solidBetterRefresh from "solid-better-refresh";

export default defineConfig({
  plugins: [
    solid(),
    solidBetterRefresh(),
  ],
});
```

## How it works

A Babel transform rewrites `createSignal()` and `createStore()` calls inside components to use a persistence wrapper. On HMR update, the wrapper returns the previously cached signal/store instead of creating a new one.

Each component instance gets its own registry slot, so `<Counter /><Counter /><Counter />` all maintain independent state. If components have distinguishing props (like `id` or `key`), the plugin fingerprints them for reorder resilience — list items that swap positions keep their correct state.

A structure check detects when you add or remove signals/stores from a component. When the structure changes, cached state for that component is invalidated and recreated fresh.

## Options

```ts
solidBetterRefresh({
  // Additional primitives to persist (merged with the defaults: createSignal, createStore)
  primitives: ["createMyCustomPrimitive"],
});
```

## Standalone Babel plugin

If you manage Babel yourself:

```ts
import solidBetterRefreshBabel from "solid-better-refresh/babel";

// In your babel config
plugins: [
  [solidBetterRefreshBabel, { primitives: ["createMyCustomPrimitive"] }],
];
```

## Known limitations

### Signals in custom hooks

Signals inside non-PascalCase functions (like `useCounter()`) are not transformed. This is by design -- the plugin can only generate stable keys for component-level primitives.

**Workaround:** Use `createSignal` directly in the component body.

### Signals in loops and callbacks

`createSignal` inside `.map()`, `<For>` callbacks, event handlers, or any nested function is intentionally skipped. These need per-iteration identity which the plugin can't provide.

```tsx
// NOT persisted (and that's correct)
<For each={items}>{(item) => {
  const [checked, setChecked] = createSignal(false);
  return <input checked={checked()} />;
}}</For>
```

### Multiple identical instances without props

When the same component is rendered multiple times without distinguishing props, state is matched by render position. If the framework re-renders instances in a different order during HMR (e.g. when editing the component's own file), state may swap between instances.

**Fix:** Add an `id` or `key` prop to each instance:

```tsx
// State persists correctly across HMR, even if render order changes
<Counter key={1} />
<Counter key={2} />
<Counter key={3} />
```

The component must accept a props parameter for fingerprinting to work:

```tsx
function Counter(props: { key: number }) { ... }
```

### createResource

`createResource` is not persisted and shouldn't be added to `primitives`. Resources re-run their fetcher with the new code, which is the correct behavior. They'll read from persisted signal inputs automatically.

### Store shape changes

If you change the shape of a `createStore` initial value without changing the total number of primitives, the old shape persists. Accessing new fields will return `undefined`. Add/remove a signal to force a structure reset.

### Aliased imports

`import { createSignal as cs } from "solid-js"` is not detected. Use the original name.

### createMemo / createEffect

These re-run correctly with new code logic and read from persisted signals. No persistence needed or provided.
