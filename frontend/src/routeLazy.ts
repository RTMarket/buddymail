import { lazy, type ComponentType } from "react";

const CHUNK_RELOAD_ONCE_KEY = "bss_lazy_chunk_reload_once_v1";

function isLazyChunkLoadError(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? err).toLowerCase();
  return (
    msg.includes("failed to fetch dynamically imported module") ||
    msg.includes("importing a module script failed") ||
    msg.includes("loading chunk")
  );
}

/** 按命名导出懒加载页面，减小首屏 JS（登录/注册页不再下载邮件营销等大模块） */
export function lazyPage<T extends ComponentType<unknown>>(
  loader: () => Promise<Record<string, T>>,
  name: string
) {
  return lazy(() =>
    loader()
      .then((mod) => {
        sessionStorage.removeItem(CHUNK_RELOAD_ONCE_KEY);
        return { default: mod[name] };
      })
      .catch((err) => {
        if (!isLazyChunkLoadError(err)) throw err;
        if (sessionStorage.getItem(CHUNK_RELOAD_ONCE_KEY) === "1") throw err;
        sessionStorage.setItem(CHUNK_RELOAD_ONCE_KEY, "1");
        window.location.reload();
        return new Promise<{ default: T }>(() => {});
      })
  );
}
