import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      "/upload": "http://localhost:5000",
      "/upload-multiple": "http://localhost:5000",
      "/files": "http://localhost:5000",
      "/qr": "http://localhost:5000",
      "/downloads": "http://localhost:5000",
      "/socket.io": {
        target: "http://localhost:5000",
        ws: true
      }
    }
  }
});
