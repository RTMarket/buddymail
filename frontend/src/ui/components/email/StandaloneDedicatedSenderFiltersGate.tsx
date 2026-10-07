import React from "react";
import type { DedicatedLaneSnapshot } from "../../../lib/dedicatedLanes";
import { useSiteLocale } from "../../../i18n/SiteLocaleContext";
import { IS_STANDALONE_DEPLOY } from "../../../lib/standaloneDeploy";

/** 独立站：加载完成前勿展示主站「轻量/中量/巨量/超量」套餐通道 picker */
export function StandaloneDedicatedSenderFiltersGate(props: {
  lanes: DedicatedLaneSnapshot[];
  lanesReady: boolean;
  laneFilters: React.ReactNode;
  legacyPicker: React.ReactNode;
  loadingLabel?: string;
}) {
  const { locale } = useSiteLocale();
  const {
    lanes,
    lanesReady,
    laneFilters,
    legacyPicker,
    loadingLabel
  } = props;
  const loading =
    loadingLabel ??
    (locale === "en" ? "Loading dedicated lanes workbench…" : "加载专线工作台…");
  const noLanesHint =
    locale === "en"
      ? "No dedicated lane data yet. Configure sending domains under Dedicated VPS setup first."
      : "暂无专线数据，请先在「专机装机」中配置发信域。";

  if (!IS_STANDALONE_DEPLOY) {
    return lanes.length > 0 ? <>{laneFilters}</> : <>{legacyPicker}</>;
  }
  if (!lanesReady && lanes.length === 0) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] text-slate-600">
        {loading}
      </div>
    );
  }
  if (lanes.length > 0) return <>{laneFilters}</>;
  return (
    <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
      {noLanesHint}
    </p>
  );
}
