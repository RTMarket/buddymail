import React, { useEffect, useRef, useState } from "react";
import { useLocation, useOutlet } from "react-router-dom";

const MAX_CACHE_ENTRIES = 14;

function routeCacheKey(pathname: string, search: string): string {
  return `${pathname}${search}`;
}

function touchLru(orderRef: React.MutableRefObject<string[]>, key: string) {
  const order = orderRef.current.filter((k) => k !== key);
  order.push(key);
  orderRef.current = order;
}

function evictLru(orderRef: React.MutableRefObject<string[]>, next: Record<string, React.ReactNode>) {
  while (orderRef.current.length > MAX_CACHE_ENTRIES) {
    const evict = orderRef.current.shift();
    if (evict) delete next[evict];
  }
}

/**
 * 已访问过的业务页保活：切走时不卸载，回来时立刻显示。
 * 每个 route key 只缓存一次 outlet（不可按引用反复 setState，否则会 remount 懒加载页并卡在 Suspense）。
 */
export function KeepAliveOutlet() {
  const location = useLocation();
  const outlet = useOutlet();
  const activeKey = routeCacheKey(location.pathname, location.search);
  const [cache, setCache] = useState<Record<string, React.ReactNode>>({});
  const orderRef = useRef<string[]>([]);
  const outletRef = useRef(outlet);
  outletRef.current = outlet;

  useEffect(() => {
    const node = outletRef.current;
    if (!node) return;
    setCache((prev) => {
      if (prev[activeKey] != null) {
        touchLru(orderRef, activeKey);
        return prev;
      }
      const next = { ...prev, [activeKey]: node };
      touchLru(orderRef, activeKey);
      evictLru(orderRef, next);
      return next;
    });
  }, [activeKey]);

  const activeNode = cache[activeKey] ?? outlet;
  if (!activeNode) return null;

  return (
    <>
      {Object.entries(cache).map(([key, node]) => {
        if (key === activeKey) return null;
        return (
          <div key={key} className="hidden" aria-hidden data-keep-alive-route={key}>
            {node}
          </div>
        );
      })}
      <div className="flex min-h-0 flex-1 flex-col" data-keep-alive-route={activeKey}>
        {activeNode}
      </div>
    </>
  );
}
