import React, { useMemo, useState } from "react";
import { STAGES, StageBoard, detectCategoryFromPath, resolveChannelLabel, useFollowupChannels } from "./CrmFollowupBoardsShared";
import type { Category } from "./CrmFollowupBoardsShared";

/**
 * 意向沟通区独立管理页
 * 路由示例：/crm/followup-boards/direct/intent
 */
export function CrmFollowupIntentPage() {
  const category: Category = detectCategoryFromPath() ?? "direct";
  const [refreshSignal, setRefreshSignal] = useState(0);
  const { channels } = useFollowupChannels();
  const catLabel = useMemo(() => resolveChannelLabel(category, channels), [category, channels]);
  const meta = useMemo(() => STAGES.find((s) => s.key === "intent")!, []);

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <a
          href={`/crm/followup-boards/${category}`}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          ← 返回总览
        </a>
        <div>
          <h1 className="text-xl font-bold text-slate-800">
            {meta.label} · {catLabel}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{meta.description}</p>
        </div>
      </div>
      <StageBoard
        category={category}
        stage="intent"
        refreshSignal={refreshSignal}
        onChanged={() => setRefreshSignal((k) => k + 1)}
      />
    </div>
  );
}
