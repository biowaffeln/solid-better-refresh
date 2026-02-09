import { createSignal } from "solid-js";
import "./App.css";

function App() {
  const [count, setCount] = createSignal(0);
  const [name, setName] = createSignal("");

  return (
    <div>
      <h1>Solid HMR State</h1>
      <button type="button" onClick={() => setCount((c) => c + 1)}>
        Count: {count()}
      </button>
      <input
        value={name()}
        onInput={(e) => setName((e.target as HTMLInputElement).value)}
      />
      <p>Hello {name() || "world"}</p>
    </div>
  );
}

export default App;
