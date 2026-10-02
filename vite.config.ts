import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import fs from "fs";
import path from "path";

// Arquivos prontos do Monaco (os mesmos que a CDN servia).
const MONACO_VS = path.resolve(__dirname, "node_modules/monaco-editor/min/vs");
const MONACO_URL = "/monaco/vs";
const CONTENT_TYPES: Record<string, string> = {
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ttf": "font/ttf",
  ".svg": "image/svg+xml",
};

/**
 * Serve o Monaco a partir do proprio dashboard sem passar pelo bundle:
 * no build copia monaco-editor/min/vs para <outDir>/monaco/vs; no dev serve
 * a mesma pasta em /monaco/vs. Ver src/lib/monacoSetup.ts.
 */
function monacoStatic(): Plugin {
  let outDir = "dist";
  return {
    name: "monaco-static",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use(MONACO_URL, (req, res, next) => {
        const relative = decodeURIComponent((req.url || "/").split("?")[0]);
        const file = path.resolve(MONACO_VS, "." + relative);
        if (!file.startsWith(MONACO_VS + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
          next();
          return;
        }
        res.setHeader("Content-Type", CONTENT_TYPES[path.extname(file)] || "application/octet-stream");
        fs.createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      fs.cpSync(MONACO_VS, path.join(outDir, "monaco", "vs"), { recursive: true });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), monacoStatic()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
});
