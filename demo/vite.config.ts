import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import solidBetterRefresh from "solid-better-refresh";

export default defineConfig({
  plugins: [solid(), solidBetterRefresh()],
});
