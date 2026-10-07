import type { IncomingMessage, ServerResponse } from "node:http";
import type { ProxyOptions } from "vite";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

/** Vite 代理连不上后端时默认可能返回「HTTP 500 + 空 body」，前端 apiJson 会误报；这里统一返回 JSON 说明。 */
function attachLocalBackendProxyErrorHandler(proxy: { on: (ev: "error", fn: (...args: unknown[]) => void) => void }) {
  proxy.on("error", (err: unknown, _req: IncomingMessage, res: unknown) => {
    const e = err as NodeJS.ErrnoException;
    const r = res as ServerResponse | undefined;
    if (!r?.writeHead || r.headersSent) return;
    const code = e?.code ?? "";
    const body = JSON.stringify({
      ok: false,
      message:
        "后端未响应（默认端口 8787）。请在仓库根目录执行 npm install && npm run dev 同时启动前后端；或另开终端在 backend 目录执行 npm run dev。前端须用 npm run dev 打开，勿用 file://。",
      detail: code || (e as Error)?.message
    });
    r.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
    r.end(body);
  });
}

function createApiProxy(target: string): ProxyOptions {
  return {
    target,
    changeOrigin: true,
    configure: (proxy) => attachLocalBackendProxyErrorHandler(proxy)
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  /** 用 127.0.0.1 避免部分环境下 localhost 优先解析 IPv6 导致连不上仅监听 IPv4 的进程 */
  const backendTarget =
    env.BACKEND_PROXY_TARGET?.trim() || env.VITE_DEV_PROXY_TARGET?.trim() || "http://127.0.0.1:8787";
  const apiProxy = createApiProxy(backendTarget);

  return {
    plugins: [react()],
    resolve: {
      dedupe: ["react", "react-dom"]
    },
    optimizeDeps: {
      include: ["react", "react-dom", "react/jsx-runtime", "react-dom/client"]
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("/node_modules/react-dom/") || id.includes("/node_modules/react/")) {
              return "react-vendor";
            }
            return undefined;
          }
        }
      }
    },
    server: {
      host: true,
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": apiProxy,
        "/uploads": { ...apiProxy }
      }
    },
    /** npm run preview 时默认没有代理，会导致 /api 全部失败 */
    preview: {
      host: true,
      port: 4173,
      strictPort: true,
      proxy: {
        "/api": apiProxy,
        "/uploads": { ...apiProxy }
      }
    }
  };
});
