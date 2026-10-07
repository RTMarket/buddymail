import { useEffect, useRef, useState } from "react";

export interface GeoSelectOption {
  value: string;
  label: string;
}

/**
 * 自定义下拉：最多展示 10 项，超出部分纵向滚动。
 *（原生 select 的展开高度由浏览器控制，做不到"最多10项+滚动"，所以用自定义实现）
 */
export function GeoSelect(props: {
  value: string;
  options: GeoSelectOption[];
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const selected = props.options.find((o) => o.value === props.value);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open ]);

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        disabled={props.disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded border border-slate-300 bg-white px-2 py-1.5 text-left text-xs disabled:opacity-50"
      >
        <span className={`truncate ${selected ? "text-slate-800" : "text-slate-400"}`}>
          {selected ? selected.label : props.placeholder || "请选择"}
        </span>
        <span className="ml-1 shrink-0 text-[10px] text-slate-400">{open ? "▲" : "▼"}</span>
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded border border-slate-300 bg-white shadow-lg">
          <div className="max-h-[280px] overflow-y-auto py-1">
            {props.options.length ? (
              props.options.map((o) => (
                <button
                  key={o.value || "__empty__"}
                  type="button"
                  onClick={() => {
                    props.onChange(o.value);
                    setOpen(false);
                  }}
                  className={`block w-full truncate px-2 py-1.5 text-left text-xs hover:bg-slate-100 ${
                    o.value === props.value ? "bg-violet-50 font-medium text-violet-700" : "text-slate-700"
                  }`}
                  title={o.label}
                >
                  {o.label}
                </button>
              ))
            ) : (
              <div className="px-2 py-1.5 text-xs text-slate-400">暂无选项</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
