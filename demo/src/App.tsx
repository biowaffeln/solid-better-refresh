import { createSignal, For } from "solid-js";
import { ThemeProvider } from "./ThemeContext";
import ThemedCard from "./ThemedCard";
import StoreDemo from "./StoreDemo";
import CustomPrimitiveDemo from "./CustomPrimitiveDemo";
import { Counter } from "./Counter";

function App() {
  const [count, setCount] = createSignal(0);
  const [name, setName] = createSignal("");

  return (
    <ThemeProvider>
      <div>
        <h1>Solid Better Refresh</h1>
        <p>Edit any file and save — state persists across HMR.</p>
        <div class="controls">
          <button type="button" onClick={() => setCount((c) => c + 1)}>
            Count: {count()}
          </button>
          <input
            value={name()}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
            placeholder="Type your name..."
          />
        </div>
        <p class="greeting">Hello, {name() || "world"}!</p>
        <ThemedCard />
        <StoreDemo />
        <CustomPrimitiveDemo />
      </div>
      <div class="demo-section">
        <strong>Multiple Instances Demo</strong>
        <Counter />
        <Counter />
        <Counter />
        <Counter />
      </div>
      <div class="demo-section">
        <strong>Known Edge Case: Loop Without Identity</strong>
        <p>
          This intentionally renders duplicate Counters from one call-site.
          Check browser console for an ambiguous identity warning.
        </p>
        <For each={[1, 2, 3, 4]}>{() => <Counter />}</For>
      </div>
    </ThemeProvider>
  );
}

export default App;
