import React, { useEffect, useMemo, useState } from "react";

export type BusinessLineId = "partner" | "factory" | "company_register" | "all";

const STORAGE_KEY = "bigsocialboss.businessLine";

const OPTIONS: Array<{ id: BusinessLineId; label: string }> = [
  { id: "all", label: "全部业务线" },
  { id: "partner", label: "合伙人招募" },
  { id: "factory", label: "工厂/供应链招商" },
  { id: "company_register", label: "企业注册/合规" }
];

export function BusinessLineSelect(props: {
  className?: string;
  onChange?: (id: BusinessLineId) => void;
}) {
  const initial = useMemo(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY) as BusinessLineId | null;
      if (v && OPTIONS.some((o) => o.id === v)) return v;
    } catch {
      // ignore
    }
    return "all" satisfies BusinessLineId;
  }, []);

  const [value, setValue] = useState<BusinessLineId>(initial);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // ignore
    }
    props.onChange?.(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <label className={props.className}>
      <span className="sr-only">业务线</span>
      <select
        className="rounded-md border border-slate-200 bg-white px-2 py-2 text-sm outline-none focus:border-slate-400"
        value={value}
        onChange={(e) => setValue(e.target.value as BusinessLineId)}
      >
        {OPTIONS.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
