import { defineConfig } from "vite";

export default defineConfig({
  base: "/admin/console/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  resolve: {
    dedupe: ["lit", "rxjs"],
  },
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      "/api": {
        target: process.env.GATEWAY_DEV_TARGET ?? "http://localhost:8080",
        changeOrigin: true,
      },
      "/admin": {
        target: process.env.GATEWAY_DEV_TARGET ?? "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
});
