import React from "react";

/** 「收起侧栏」：侧栏左缘竖线 + 向右箭头 */
export function IconPanelRight(props: { className?: string }) {
  return (
    <svg className={props.className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
      <path d="m14 10 2 2-2 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 「展开侧栏」 */
export function IconPanelLeft(props: { className?: string }) {
  return (
    <svg className={props.className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M15 4v16" />
      <path d="m10 14-2-2 2-2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
