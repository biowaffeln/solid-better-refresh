# Solid Better Refresh

Persist `createSignal` and `createStore` state across HMR updates in SolidJS.

## Packages

- [`packages/solid-better-refresh`](./packages/solid-better-refresh) — the Vite plugin 
- [`demo`](./demo) — a minimal Solid app wired up to the plugin for manual testing

## Quick start

```bash
# build the plugin
cd packages/solid-better-refresh
npm install && npm run build

# run the demo
cd ../../demo
npm install && npm run dev
```

Open http://localhost:5173, increment the counter, type in the input, edit `demo/src/App.tsx`, save — state persists.

See the [package README](./packages/solid-better-refresh/README.md) for usage and configuration.
