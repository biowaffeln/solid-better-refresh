import { createSignal } from "solid-js";

/** Custom primitive — wraps createSignal with increment/decrement helpers */
export function createCounter(initial = 0) {
  const [count, setCount] = createSignal(initial);

  return {
    count,
    increment: () => setCount((c) => c + 1),
    decrement: () => setCount((c) => c - 1),
    reset: () => setCount(initial),
  };
}
