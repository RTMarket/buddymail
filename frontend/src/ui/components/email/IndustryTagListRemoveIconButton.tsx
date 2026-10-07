import React from "react";

/** 行业标签列表「从下拉隐藏」：小圆框红 ×（比 CRM 数据库页删数据按钮略小） */
export function IndustryTagListRemoveIconButton(props: {
  tag: string;
  disabled?: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      className="flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-full border border-rose-400/80 bg-rose-50 text-rose-600 transition-colors hover:border-rose-500 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-45"
      disabled={props.disabled}
      title={`移除行业标签「${props.tag}」及其下全部 CRM 联系人`}
      aria-label={`移除行业标签 ${props.tag} 及联系人`}
      onClick={props.onClick}
    >
      <svg viewBox="0 0 10 10" className="h-2 w-2" aria-hidden>
        <path d="M2 2 8 8M8 2 2 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </button>
  );
}
