import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createUseRunningEffectDocument } from "./src/use-running-effect-document.mjs";

export default defineConfig({
  base: "./",
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react(), {
    name: "brizo-use-running-effect",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "use-running-effect.html", source: createUseRunningEffectDocument() });
    },
    configureServer(server) {
      server.middlewares.use("/use-running-effect.html", (_request, response) => {
        response.setHeader("Content-Type", "text/html; charset=utf-8");
        response.end(createUseRunningEffectDocument());
      });
    },
  }],
});
