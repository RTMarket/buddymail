import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageShell } from "../components/PageShell";
import { SectionCard } from "../components/SectionCard";
import { apiJson } from "../../lib/api";

type ExportRow = {
  id: number;
  filename: string;
  rowCount: number;
  createdAt: string;
};

export function LeadsExportsPage() {
  const [items, setItems] = useState<ExportRow[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const r = await apiJson<{ ok: boolean; items?: ExportRow[]; message?: string }>("/api/leads/exports");
      if (!r.ok) throw new Error(r.message || "加载失败");
      setItems(r.items ?? []);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function download(id: number, filename: string) {
    try {
      const resp = await fetch(`/api/leads/exports/${id}/download`, { credentials: "include" });
      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(t || `HTTP ${resp.status}`);
      }
      const blob = await resp.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  }

  return (
    <PageShell title="导出记录" description="Leads CSV 历史导出，可再次下载。">
      <div className="mb-3 flex flex-wrap gap-3 text-sm">
        <Link className="text-blue-600 hover:underline" to="/leads/search">
          Leads 搜索
        </Link>
        <Link className="text-blue-600 hover:underline" to="/leads/usage">
          用量与额度
        </Link>
        <button type="button" className="text-slate-600 hover:underline" onClick={() => void load()}>
          刷新
        </button>
      </div>
      <SectionCard title="历史导出">
        {loading ? <p className="text-sm text-slate-500">加载中…</p> : null}
        {err ? <p className="text-sm text-rose-600">{err}</p> : null}
        {!loading && !items.length ? <p className="text-sm text-slate-500">暂无导出记录。</p> : null}
        {items.length ? (
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="p-2">时间</th>
                <th className="p-2">文件名</th>
                <th className="p-2">条数</th>
                <th className="p-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="p-2 whitespace-nowrap">{String(r.createdAt).replace("T", " ").slice(0, 19)}</td>
                  <td className="p-2 break-all">{r.filename}</td>
                  <td className="p-2">{r.rowCount}</td>
                  <td className="p-2">
                    <button
                      type="button"
                      className="text-blue-600 hover:underline"
                      onClick={() => void download(r.id, r.filename)}
                    >
                      下载
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </SectionCard>
    </PageShell>
  );
}
