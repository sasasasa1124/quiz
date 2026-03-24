import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["cjs", "esm"],
    dts: true,
    splitting: false,
    sourcemap: false,
    clean: true,
    external: ["react", "react-dom", "next", "lucide-react"],
  },
  {
    entry: { handler: "src/handler.ts" },
    format: ["cjs", "esm"],
    dts: true,
    splitting: false,
    sourcemap: false,
    external: ["react", "react-dom", "next", "lucide-react"],
  },
]);
