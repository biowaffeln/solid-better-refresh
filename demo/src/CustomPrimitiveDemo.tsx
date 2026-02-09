import { createCounter } from "./createCounter";

export default function CustomPrimitiveDemo() {
  const { count, increment, decrement, reset } = createCounter(10);

  return (
    <div class="demo-section">
      <strong>Custom primitive demo</strong>
      <p class="hint">
        Uses <code>createCounter</code> (custom primitive registered via{" "}
        <code>primitives</code> option)
      </p>
      <div class="controls">
        <button onClick={decrement}>-</button>
        <span class="counter-value">{count()}</span>
        <button onClick={increment}>+</button>
        <button onClick={reset}>Reset</button>
      </div>
      <p class="hint">
        Change this text and save — counter should persist at {count()}.
      </p>
    </div>
  );
}
