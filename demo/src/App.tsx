import { createSignal } from "solid-js";
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
        <strong>Multiple Instances Demo 1</strong>
        <Counter>Increment</Counter>
        <Counter>Increment</Counter>
        <Counter>Increment</Counter>
        <Counter>Increment</Counter>
      </div>
    </ThemeProvider>
  );
}

export default App;
