import { createSignal } from "solid-js";

export function Counter(props: { children?: string }) {
  const [count, setCount] = createSignal(0);

  return (
    <div>
      <button type="button" onClick={() => setCount(count() + 1)}>
        {props.children || "Increment"}
      </button>
      <p>Count: {count()}</p>
    </div>
  );
}
