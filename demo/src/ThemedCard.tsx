import { createSignal } from "solid-js";
import { useTheme } from "./ThemeContext";

export default function ThemedCard() {
  const { theme, toggle } = useTheme();
  const [clicks, setClicks] = createSignal(0);

  return (
    <div
      class="themed-card"
      style={{
        background: theme() === "dark" ? "#2a2a3e" : "#e8e8f0",
        color: theme() === "dark" ? "#e0e0e0" : "#1a1a2e",
      }}
    >
      <div class="card-header">
        <strong>Context Demo</strong>
        <span>{theme()} mode</span>
      </div>
      <div class="card-actions">
        <button onClick={toggle}>Toggle theme</button>
        <button onClick={() => setClicks((c) => c + 1)}>
          Clicks: {clicks()}
        </button>
      </div>
    </div>
  );
}
