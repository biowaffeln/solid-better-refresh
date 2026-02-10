# solid-better-refresh

**State-preserving Hot Module Replacement for SolidJS**

A Babel plugin + Vite runtime that persists `createSignal` and `createStore` state
across HMR updates, bringing React Fast Refresh-level DX to Solid applications.

## The Problem

When you edit a Solid component and save, `solid-refresh` hot-replaces the component
but all local state resets to initial values. You lose your form inputs, counter values,
toggle states, etc. This is because Solid components run once — there's no "re-render"
that can swap in new code while keeping state.

## How It Works

### End-to-End Data Flow

Let's trace what happens when you have this component:

```tsx
// src/Counter.tsx
import { createSignal } from "solid-js";

function Counter() {
  const [count, setCount] = createSignal(0);
  const [name, setName] = createSignal("world");
  return (
    <div>
      <p>Hello {name()}, count: {count()}</p>
      <button onClick={() => setCount(c => c + 1)}>+1</button>
    </div>
  );
}
```

#### Step 1: vite-plugin-solid Compiles (runs first)

Babel-preset-solid compiles the JSX into real DOM operations.
Solid-refresh wraps the component for hot replacement:

```js
var Counter = _$component(_REGISTRY, "Counter", function Counter() {
  const [count, setCount] = createSignal(0);
  const [name, setName] = createSignal("world");
  // ...compiled DOM creation code...
});
```

Note: `createSignal` calls are still present and untouched — solid-refresh only
wraps the component function, it doesn't transform the signal primitives.

#### Step 2: Our Babel Plugin Transforms (runs after solid, despite `enforce: "pre"`)

```js
var Counter = _$component(_REGISTRY, "Counter", function Counter(props) {
  const [count, setCount] = __hmr_persist(
    import.meta.hot,
    "src/Counter.tsx::Counter::signal::0",
    createSignal,
    [0],
    props   // 5th arg: passed for fingerprinting when component has a props param
  );
  const [name, setName] = __hmr_persist(
    import.meta.hot,
    "src/Counter.tsx::Counter::signal::1",
    createSignal,
    ["world"],
    props
  );
  // ...compiled DOM creation code...
});

// Injected after imports, before component definitions:
__hmr_checkStructure(import.meta.hot?.data, { "Counter": 2 });
```

The babel plugin finds `createSignal` calls inside the solid-refresh wrapper by
checking `FunctionExpression.id.name` for PascalCase — this matches the
`function Counter() { ... }` named function expression that solid-refresh preserves
as its third argument to `_$component()`.

If the component function has a first parameter that's an Identifier (e.g. `props`),
it's injected as the 5th argument to `__hmr_persist` for props fingerprinting.
Components with no params (propless singletons) keep 4 args.

#### Step 3: Browser Loads the Module (first load)

```
__hmr_checkStructure(hot.data, { Counter: 2 })
  → No previous structure, stores { Counter: 2 } for next time
  → Resets instance counters to new Map

__hmr_persist called with key "...::Counter::signal::0"
  → Schedules microtask to reset instance counters after this render batch
  → Instance counter for this key: 0 (increments to 1)
  → Registry key: "...::Counter::signal::0::0"
  → Registry is empty → calls createSignal(0), stores in registry
  → Returns [getter, setter] ← count is 0

__hmr_persist called with key "...::Counter::signal::1"
  → Instance counter for this key: 0 (increments to 1)
  → Registry key: "...::Counter::signal::1::0"
  → Calls createSignal("world"), stores in registry
  → Returns [getter, setter] ← name is "world"

Microtask fires → resets instance counters to new Map

Component renders normally. User clicks +1 a few times. count is now 5.
```

#### Step 4: You Edit the JSX and Save

You change `<p>Hello {name()}, count: {count()}</p>` to
`<p>Hi {name()}! Count is {count()}</p>` and save.

```
Vite detects file change
  → Re-transforms src/Counter.tsx
  → vite-plugin-solid compiles again
  → Our babel plugin runs again (same transforms)
  → solid-refresh detects the module update

solid-refresh disposes the old component's reactive subtree
  → Old effects, memos, DOM nodes cleaned up
  → But import.meta.hot.data SURVIVES (Vite persists it)

New module code executes:

__hmr_checkStructure(hot.data, { Counter: 2 })
  → Previous: { Counter: 2 }, Current: { Counter: 2 }
  → Match! Keep registry intact.
  → Resets instance counters

__hmr_persist called with key "...::Counter::signal::0"
  → Instance counter: 0, registry key: "...::Counter::signal::0::0"
  → Registry HIT → returns the SAME [getter, setter] ← count is still 5! ✓

__hmr_persist called with key "...::Counter::signal::1"
  → Instance counter: 0, registry key: "...::Counter::signal::1::0"
  → Registry HIT → returns the SAME [getter, setter] ← name is still "world" ✓

Component renders with new JSX template but OLD signal values.
The button still works, count continues from 5.
```

#### Step 5: What if You Add a New Signal?

You add `const [visible, setVisible] = createSignal(true);`

```
__hmr_checkStructure({ Counter: 3 })
  → Previous: { Counter: 2 }, Current: { Counter: 3 }
  → MISMATCH! Signal count changed.
  → Clears registry, sets invalidated flag

All __hmr_persist calls create fresh signals (but store them in the registry)
  → count resets to 0, name resets to "world", visible starts as true
  → Clean slate — no risk of mismatched state
  → Next save with same structure will immediately reuse state
```

This matches React Fast Refresh's behavior: structural changes to hooks cause a full reset.

---

## Architecture Diagram

```
                        YOUR SOURCE
                        Counter.tsx
                            │
                            ▼
              ┌─────────────────────────┐
              │    vite-plugin-solid     │  (runs first despite our enforce:"pre")
              │  ┌─────────────────────┐ │
              │  │  babel-preset-solid │ │  Compiles JSX → DOM operations
              │  │   solid-refresh     │ │  Wraps components in _$component()
              │  └─────────────────────┘ │  Injects import.meta.hot.accept()
              └─────────────────────────┘
                            │
                            ▼
              ┌─────────────────────────────┐
              │  solid-better-refresh:transform  │  (Vite plugin, enforce: "pre")
              │  ┌─────────────────────────┐│
              │  │    babel-plugin.ts      ││  Finds createSignal inside
              │  │                         ││  _$component() wrappers via
              │  │                         ││  FunctionExpression.id.name
              │  └─────────────────────────┘│  Rewrites → __hmr_persist
              └─────────────────────────────┘  Injects __hmr_checkStructure at EOF
                            │
                            ▼
              ┌─────────────────────────┐
              │  solid-better-refresh:runtime │  (Vite plugin, virtual module)
              │                         │
              │  Serves __hmr_persist   │  When browser imports
              │  and __hmr_checkStructure│  "virtual:solid-better-refresh"
              │  functions              │
              └─────────────────────────┘
                            │
                            ▼
                     ┌──────────┐
                     │ BROWSER  │
                     ├──────────┤
                     │          │
                     │  import.meta.hot.data ─── persisted across HMR ───┐
                     │    .__hmr_registry                                │
                     │      "Counter::signal::0::0" → [getter, setter] ◄┘
                     │      "Counter::signal::1::0" → [getter, setter]
                     │    .__hmr_prevStructure
                     │      { Counter: 2 }
                     │    .__hmr_instanceCounters
                     │      Map { "Counter::signal::0" → 1, ... }
                     │
                     └──────────┘
```

---

## Key Design Decisions

### Why does vite-plugin-solid run before us?

Despite our transform using `enforce: "pre"`, vite-plugin-solid's transform also
runs at the "pre" level (or equivalent), and because `solid()` appears before our
plugins in the config array, it wins the ordering.

This is actually fine. After solid compilation, `createSignal` calls are still
present in the output — solid-refresh doesn't touch them. The only thing we need
to handle is that the component is wrapped: `_$component(REG, "App", function App() { ... })`.
Our `findEnclosingComponent` handles this by checking `FunctionExpression.id.name`
for PascalCase, which matches the named function expression solid-refresh preserves.

### Why not hook into vite-plugin-solid's `babel` option?

The `babel` option in vite-plugin-solid lets you add extra Babel plugins to its
compilation pass:

```ts
solid({
  babel: {
    plugins: [["solid-better-refresh/babel", {}]]
  }
})
```

This would run our plugin in the same Babel pass, before solid-refresh wraps things.
It avoids a double-parse of the file. But the standalone Vite transform approach
is more self-contained (just add the plugin, no config), which is better DX.

### Why call-order indexing instead of variable name keying?

We key signals as `ComponentName::signal::0`, `ComponentName::signal::1`, etc.
An alternative would be keying by variable name: `ComponentName::count`, `ComponentName::name`.

Variable name keying is more resilient to reordering but has issues:
- Destructured names can collide: `const [state, setState] = createSignal(...)` is common
- You can have the same variable name in different branches (if/else)
- It requires more AST analysis to extract the destructured names reliably

Call-order indexing is simpler and matches React Fast Refresh's approach. The tradeoff
is that reordering signals without adding/removing them could cause state to "swap"
between variables — but this is a very rare edit pattern, and the structural change
detection would catch it if the types differ.

### Multi-instance disambiguation

When the same component is rendered multiple times (`<Counter /><Counter /><Counter />`),
each instance needs its own registry slot. We use a per-key instance counter that
increments on each `__hmr_persist` call and resets between render cycles.

**Counter reset via two mechanisms (belt and suspenders):**
- `__hmr_checkStructure` resets counters synchronously when a module re-executes (own-module HMR)
- `scheduleCursorReset` uses `queueMicrotask` to reset after each synchronous render batch
  (handles cross-module re-renders where a parent's HMR triggers child re-render without
  the child's module re-executing)

**Props fingerprinting** provides reorder resilience. When a component has a `props`
parameter, the babel plugin passes it as the 5th arg to `__hmr_persist`. The runtime
fingerprints it — fast path for `id`/`key` props, slow path hashing all primitive
prop values. The fingerprint is incorporated into the counter key, so instances with
different props get independent counter namespaces.

Registry key format:
- Positional (no props): `filename::ComponentName::type::index::instanceNum`
- With fingerprint: `filename::ComponentName::type::index::fp:id=42::instanceNum`

### Why persist signals but not effects?

Effects (`createEffect`) and memos (`createMemo`) are DERIVED state — they compute
values from signals or produce side effects. When the component code changes, you
WANT the new effects to run, because their logic may have changed. But you want them
to read from the same signals that hold your persisted state.

This happens naturally:
1. Old effects are disposed (solid-refresh handles this)
2. New component body runs with new code
3. `__hmr_persist` returns the old signals (state preserved)
4. New `createEffect` calls create fresh effects with new logic
5. These new effects subscribe to the old signals
6. Everything works!

---

## File Structure

```
packages/solid-better-refresh/src/
├── babel-plugin.ts    # AST transform: createSignal → __hmr_persist
├── runtime.ts         # Browser runtime, built by tsup → dist/runtime.js
├── vite-plugin.ts     # Vite integration: serves runtime + runs transform
├── index.ts           # Re-exports vite plugin (default + named)
└── ARCHITECTURE.md    # This file
```

`runtime.ts` is built by tsup into `dist/runtime.js`, which the vite plugin reads
via `fs.readFileSync` at startup. An inline fallback string inside `vite-plugin.ts`
is used when the built file isn't available (e.g. during dev of this package itself).

---

## Limitations & Future Work

### Current Limitations

1. **Structural changes reset the affected component's state** — Adding or removing
   a signal resets all signals in that component. Other components in the same file
   are unaffected. A smarter diffing algorithm could preserve unaffected signals.

2. **Identical propless multi-instances** — When the same component is rendered
   multiple times without distinguishing props, state is matched by render position.
   If the framework re-renders instances in a different order during HMR, state
   may swap between instances. Fix: add `id` or `key` props.

3. **No createResource support** — Resources involve async state and could be
   persisted similarly, but the refetch/loading state makes it trickier.

4. **Context values not persisted** — If a component creates a context provider
   with a signal, the signal is persisted but consumers may need to re-subscribe.

5. **Signals in loops/conditionals** — `createSignal` inside a `for` loop or
   conditional branch is tricky to key stably. The current approach counts them
   in call order, which breaks if the branch condition changes.

### Future Improvements

- **Variable-name based keying** (opt-in): Use `@hmr-key count` comment annotations
  for stable manual keys on important signals.

- **Selective invalidation**: Instead of resetting all signals when structure changes,
  use a diffing algorithm to match old and new signals by position + type.

- **createResource persistence**: Persist the last resolved value so resources
  don't re-fetch on every HMR update.

- **Store deep merge**: When a `createStore` shape changes (new fields added),
  merge old values into the new structure instead of resetting entirely.
