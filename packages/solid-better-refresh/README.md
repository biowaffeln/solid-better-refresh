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
  plugins: [solid(), solidBetterRefresh()],
});
```

## How it works

A Babel transform rewrites `createSignal()` and `createStore()` calls at:

- component top-level scope (PascalCase components), and
- module scope (persisted under an internal `__module__` key)

to use a persistence wrapper. On HMR update, the wrapper returns the previously cached signal/store instead of creating a new one.

Each component instance gets its own registry slot, so `<Counter /><Counter /><Counter />` all maintain independent state. The transform injects an internal call-site identity (`__hmrSite`) for component usages, which significantly reduces state swaps for duplicate sibling instances without requiring user props. If the component also has distinguishing props (like `id` or `key`), those remain part of fallback fingerprinting.

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

## When state won't persist

### Component library internal state

The plugin can only transform code in your source files. If a component from a library (e.g. a dialog from Kobalte or Corvu) manages its own signals internally, that state will reset on HMR.

The fix is to use controlled components — surface the state into your own code, where the plugin can persist it:

```tsx
// Uncontrolled: the library owns the open state internally — resets on HMR
<Dialog.Root />

// Controlled: you own the state — persists across HMR
const [open, setOpen] = createSignal(false);
<Dialog.Root open={open()} onOpenChange={setOpen} />
```

### Custom hooks

Signals inside non-PascalCase functions (like `useCounter()`) are not transformed by default. You can opt them in by adding the function name to `primitives`:

```ts
solidBetterRefresh({
  primitives: ["createCounter", "useCounter"],
});
```

### Signals in loops and callbacks

`createSignal` inside `.map()` callbacks, `<For>` children, event handlers, or other nested functions is intentionally skipped. These create signals per-iteration and need their own identity, which the plugin can't provide statically.

### Ambiguous duplicate instances

When the same component appears multiple times, the plugin uses an internal call-site identity to match instances across HMR updates. This works well for most cases.

If the plugin detects that two instances are ambiguous (e.g. dynamically rendered duplicates), it logs a console warning:

```
[solid-better-refresh] ambiguous HMR identity for duplicate instances of "Counter".
State is positional and may swap after refresh.
```

If you see this, you can give instances an explicit `key` or `id` prop to disambiguate them:

```tsx
<Counter key={1} />
<Counter key={2} />
<Counter key={3} />
```
