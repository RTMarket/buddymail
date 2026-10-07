import React from "react";

/** 6 位编号 + 紫色轮次（用于发送页，HTML 内联展示） */
export function CampaignCodeWithRound(props: {
  code: string;
  roundNo: number;
  codeClassName?: string;
  roundClassName?: string;
}) {
  const code = String(props.code ?? "").trim();
  const r = Math.max(1, Math.floor(Number(props.roundNo) || 0));
  if (!code) return null;
  return (
    <span className="inline-flex items-baseline gap-0 font-mono tabular-nums">
      <span className={props.codeClassName ?? "font-semibold text-slate-900"}>{code}</span>
      <span className="text-slate-400"> · </span>
      <span className={props.roundClassName ?? "text-sm font-semibold text-violet-600"}>{r}</span>
    </span>
  );
}
