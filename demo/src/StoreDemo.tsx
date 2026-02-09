import { For } from "solid-js";
import { createStore } from "solid-js/store";

export default function StoreDemo() {
  const [store, setStore] = createStore({ items: [] as string[], filter: "" });

  return (
    <div class="demo-section">
      <strong>createStore demo</strong>
      <div class="controls">
        <input
          value={store.filter}
          onInput={(e) =>
            setStore("filter", (e.target as HTMLInputElement).value)
          }
          placeholder="Filter items..."
        />
        <button
          type="button"
          onClick={() =>
            setStore("items", (items) => [...items, `Item ${items.length + 1}`])
          }
        >
          Add item
        </button>
      </div>
      <ul class="item-list">
        <For
          each={store.items.filter((i) =>
            i.toLowerCase().includes(store.filter.toLowerCase()),
          )}
        >
          {(item) => <li>{item}</li>}
        </For>
      </ul>
      <p class="hint">
        {store.items.length} items — add some, then edit this file. Store should
        persist.
      </p>
    </div>
  );
}
