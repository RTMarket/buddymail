import React from "react";

export function SectionCard(props: {
  title: string;
  description?: string;
  right?: React.ReactNode;
  children?: React.ReactNode;
  compact?: boolean;
  /** 栅格内多卡等高：根节点 h-full + 内容区 flex-1 */
  fillHeight?: boolean;
  /** 覆盖标题字号（默认 text-sm），例如传 "text-xs" */
  titleClassName?: string;
}) {
  const compact = props.compact === true;
  const fillHeight = props.fillHeight === true;
  return (
    <div
      className={`${compact ? "rounded-lg border border-slate-200/80 bg-white/90 shadow-sm" : "rounded-lg border border-slate-200 bg-white"}${
        fillHeight ? " flex h-full min-h-0 flex-col" : ""
      }`}
    >
      <div
        className={
          compact
            ? `flex items-start justify-between gap-3 border-b border-slate-100 px-3 py-2${fillHeight ? " min-h-[2.75rem]" : ""}`
            : "flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-3"
        }
      >
        <div>
          <div className={compact ? "text-xs font-medium text-slate-800" : `text-sm font-medium${props.titleClassName ? ` ${props.titleClassName}` : ""}`}>{props.title}</div>
          {props.description ? (
            <div className={compact ? "mt-0.5 text-[10px] text-slate-500" : "mt-1 text-xs text-slate-500"}>
              {props.description}
            </div>
          ) : null}
        </div>
        {props.right ? <div className="shrink-0">{props.right}</div> : null}
      </div>
      {props.children ? (
        <div className={`${compact ? "p-3" : "p-4"}${fillHeight ? " flex-1" : ""}`}>{props.children}</div>
      ) : null}
    </div>
  );
}

