import { useEffect, useMemo, useState } from "react";
import { apiJsonWithTimeout } from "./api";
import {
  readDedicatedLanesCache,
  usesMultiLaneFormalSend,
  writeDedicatedLanesCache,
  type DedicatedLanesResponse
} from "./dedicatedLanes";

const DEDICATED_LANES_MODE_TIMEOUT_MS = 15_000;

/**
 * 邮件营销 / 统计页壳：须等 dedicated-lanes 首响后再分流，避免多机组先闪单机组布局。
 * 若 session 缓存已确认为多机组，可立即渲染多机组页并在后台对账。
 */
export function useEmailCampaignPackageMode() {
  const lanesCache = useMemo(() => readDedicatedLanesCache(), []);
  const cacheMulti = useMemo(
    () =>
      lanesCache ? usesMultiLaneFormalSend(lanesCache.dailyLimit, lanesCache.lanes) : null,
    [lanesCache]
  );

  const [multiLane, setMultiLane] = useState(() => cacheMulti === true);
  /** 仅缓存已确认 multi 时不阻塞；否则等 API，防止多机组误渲染单机组 */
  const [blocking, setBlocking] = useState(() => cacheMulti !== true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiJsonWithTimeout<DedicatedLanesResponse>(
          "/api/email/dedicated-lanes",
          undefined,
          DEDICATED_LANES_MODE_TIMEOUT_MS
        );
        if (cancelled) return;
        const lanes = Array.isArray(res.lanes) ? res.lanes : [];
        const dailyLimit = Math.max(0, Number(res.dailyLimit ?? 0));
        if (lanes.length > 0) writeDedicatedLanesCache(dailyLimit, lanes);
        setMultiLane(usesMultiLaneFormalSend(dailyLimit, lanes));
      } catch {
        if (!cancelled) {
          if (cacheMulti === true) setMultiLane(true);
          else if (lanesCache) {
            setMultiLane(usesMultiLaneFormalSend(lanesCache.dailyLimit, lanesCache.lanes));
          } else {
            setMultiLane(false);
          }
        }
      } finally {
        if (!cancelled) setBlocking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cacheMulti, lanesCache]);

  return { multiLane, blocking };
}
