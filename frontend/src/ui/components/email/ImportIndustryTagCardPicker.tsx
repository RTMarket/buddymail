import React, { useEffect, useRef, useState } from "react";
import { IndustryTagListRemoveIconButton } from "./IndustryTagListRemoveIconButton";

/** 下拉列表可视区最多 15 行，超出纵向滚动 */
export const IMPORT_INDUSTRY_TAG_DROPDOWN_MAX_VISIBLE = 15;

export function ImportIndustryTagCardPicker(props: {
  tags: string[];
  selected: string;
  onSelect: (tag: string) => void;
  onRemove: (tag: string) => void;
  formatLabel?: (tag: string) => string;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
  emptyHint?: string;
}) {
  const {
    tags,
    selected,
    onSelect,
    onRemove,
    formatLabel = (t) => t,
    disabled = false,
    label = "导入行业标签（单选）",
    placeholder = "请选择行业标签…",
    emptyHint = "暂无行业标签。请先上方「新建行业标签」创建。"
  } = props;

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      const el = rootRef.current;
      if (el && !el.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  const triggerLabel = selected ? formatLabel(selected) : placeholder;

  return (
    <div className="grid gap-1.5" ref={rootRef}>
      <span className="text-xs text-slate-600">{label}</span>
      {tags.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500">
          {emptyHint}
        </p>
      ) : (
        <div className="relative">
          <button
            type="button"
            disabled={disabled}
            className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 text-left text-sm text-slate-800 outline-none hover:border-slate-300 focus:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
            aria-expanded={open}
            aria-haspopup="listbox"
            onClick={() => {
              setOpen((v) => {
                const next = !v;
                return next;
              });
            }}
          >
            <span className={`min-w-0 truncate ${selected ? "" : "text-slate-400"}`}>{triggerLabel}</span>
            <span className="shrink-0 text-xs text-slate-400">{open ? "▲" : "▼"}</span>
          </button>
          {open ? (
            <ul
              className="absolute z-30 mt-1 max-h-[calc(2.25rem*15+0.25rem)] w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-slate-100"
              role="listbox"
              aria-label={label}
            >
              {tags.map((tag) => {
                const active = selected === tag;
                return (
                  <li key={tag} className="flex items-center gap-1.5 py-0.5 pl-0.5 pr-1.5">
                    <button
                      type="button"
                      disabled={disabled}
                      className={`min-w-0 flex-1 truncate px-2 py-1.5 text-left text-[11px] hover:bg-emerald-50 disabled:opacity-50 ${
                        active ? "bg-emerald-50 font-medium text-emerald-900" : "text-slate-700"
                      }`}
                      title={formatLabel(tag)}
                      aria-selected={active}
                      onClick={() => {
                        onSelect(tag);
                        setOpen(false);
                      }}
                    >
                      {formatLabel(tag)}
                    </button>
                    <IndustryTagListRemoveIconButton
                      tag={tag}
                      disabled={disabled}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onRemove(tag);
                      }}
                    />
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  );
}
