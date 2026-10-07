import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageShell } from "../components/PageShell";
import { SectionCard } from "../components/SectionCard";
import { apiJson } from "../../lib/api";

type UsageResp = {
  ok: boolean;
  monthUnits?: number;
  byAction?: Record<string, { units: number; events: number }>;
  recent?: Array<{ id: number; action: string; units: number; occurredAt: string; metaJson?: unknown }>;
  apolloConfigured?: boolean;
  hunterConfigured?: boolean;
  message?: string;
};

export function LeadsUsagePage() {
  const [data, setData] = useState<UsageResp | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await apiJson<UsageResp>("/api/leads/usage");
        if (!cancelled) {
          if (!r.ok) setErr(r.message || "加载失败");
          else setData(r);
        }
      } catch (e: any) {
        if (!cancelled) setErr(String(e?.message ?? e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const byAction = data?.byAction ?? {};

  return (
    <PageShell title="用量与额度" description="本月 Leads 搜索 / 导出消耗（按条数记 usage_events）。">
      <div className="mb-3 flex flex-wrap gap-3 text-sm">
        <Link className="text-blue-600 hover:underline" to="/leads/search">
          Leads 搜索
        </Link>
        <Link className="text-blue-600 hover:underline" to="/leads/exports">
          导出记录
        </Link>
      </div>
      {err ? <p className="mb-3 text-sm text-rose-600">{err}</p> : null}
      <SectionCard title="本月汇总">
        <p className="text-sm text-slate-700">
          本月累计 units：<strong>{data?.monthUnits ?? "—"}</strong>
        </p>
        <p className="mt-1 text-xs text-slate-500">调研引擎：Kimi（无需 Apollo / Hunter）</p>
        <ul className="mt-3 space-y-1 text-sm text-slate-700">
          {Object.entries(byAction).map(([action, v]) => (
            <li key={action}>
              {action}：{v.units} units / {v.events} 次
            </li>
          ))}
          {!Object.keys(byAction).length ? <li className="text-slate-500">本月尚无记录</li> : null}
        </ul>
      </SectionCard>
      <div className="mt-4">
      <SectionCard title="最近 50 条">
        {!data?.recent?.length ? (
          <p className="text-sm text-slate-500">暂无</p>
        ) : (
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="p-2">时间</th>
                <th className="p-2">动作</th>
                <th className="p-2">units</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="p-2 whitespace-nowrap">{String(r.occurredAt).replace("T", " ").slice(0, 19)}</td>
                  <td className="p-2">{r.action}</td>
                  <td className="p-2">{r.units}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
      </div>
    </PageShell>
  );
}
