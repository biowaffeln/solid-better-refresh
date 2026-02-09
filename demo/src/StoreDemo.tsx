import { For } from "solid-js";
import { createStore } from "solid-js/store";

const adjectives = [
  "fuzzy",
  "cosmic",
  "sneaky",
  "wobbly",
  "crunchy",
  "spicy",
  "rusty",
  "bouncy",
  "crispy",
  "shiny",
  "grumpy",
  "jolly",
  "zesty",
  "dusty",
  "mighty",
  "lazy",
  "fancy",
  "turbo",
  "chunky",
  "salty",
];

const verbs = [
  "juggle",
  "yeet",
  "vibe",
  "steal",
  "ride",
  "launch",
  "hug",
  "punt",
  "grill",
  "stack",
  "flip",
  "chase",
  "summon",
  "toast",
  "drop",
  "sniff",
  "haunt",
  "flex",
  "deploy",
  "befriend",
];

const nouns = [
  "badger",
  "taco",
  "wizard",
  "potato",
  "narwhal",
  "waffle",
  "pickle",
  "cactus",
  "penguin",
  "noodle",
  "robot",
  "llama",
  "muffin",
  "pretzel",
  "goblin",
  "panda",
  "donut",
  "yeti",
  "nugget",
  "squid",
];

const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

function randomName() {
  return `${pick(verbs)} ${pick(adjectives)} ${pick(nouns)}`;
}

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
          onClick={() => setStore("items", (items) => [...items, randomName()])}
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
