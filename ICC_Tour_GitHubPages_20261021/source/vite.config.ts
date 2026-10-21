import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// base: "./" … どのリポジトリ名・どの場所（/リポジトリ名/ など）に置いても動くよう、相対パスで出力する。
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
});
