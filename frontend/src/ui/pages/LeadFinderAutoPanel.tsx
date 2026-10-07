import React, { useCallback, useEffect, useState } from "react";
import { apiJson, downloadAuthenticatedFile } from "../../lib/api";

type AutoSettings = {
  enabled: boolean;
  countries: string[];
  dailyQuota: number;
  runHour: number;
  timezone: string;
  apiBaseUrl: string;
  apiModel: string;
  hasApiKey: boolean;
  apiKeyMasked: string | null;
};

type Job = {
  id: number;
  run_date: string;
  status: string;
  quota: number;
  processed: number;
  imported: number;
  skipped: number;
  crm_tag: string;
  current_domain: string | null;
  current_note: string | null;
  has_csv?: number;
};

type EventRow = { domain: string | null; status: string; note: string | null; created_at: string };

export function LeadFinderAutoPanel({ zh }: { zh: boolean }) {
  const [settings, setSettings] = useState<AutoSettings | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [active, setActive] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const loadSettings = useCallback(async () => {
    const r = await apiJson<{ ok: boolean; settings: AutoSettings }>("/api/standalone/lead-finder/auto/settings");
    if (r.settings) setSettings(r.settings);
  }, []);

  const loadStatus = useCallback(async () => {
    const r = await apiJson<{ ok: boolean; jobs: Job[]; active: Job | null; events: EventRow[] }>(
      "/api/standalone/lead-finder/auto/status"
    );
    setJobs(r.jobs || []);
    setActive(r.active || null);
    setEvents(r.events || []);
  }, []);

  useEffect(() => {
    void loadSettings();
    void loadStatus();
    const t = window.setInterval(() => void loadStatus(), 3000);
    return () => window.clearInterval(t);
  }, [loadSettings, loadStatus]);

  const save = async () => {
    if (!settings) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await apiJson<{ ok: boolean; settings: AutoSettings }>("/api/standalone/lead-finder/auto/settings", {
        method: "PUT",
        body: JSON.stringify({
          enabled: settings.enabled,
          countries: settings.countries,
          dailyQuota: settings.dailyQuota,
          runHour: settings.runHour
        })
      });
      if (r.settings) setSettings(r.settings);
      setMsg(zh ? "已保存：每天 05:00 自动跑（需打开开关）" : "Saved");
    } catch (e) {
      setMsg(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    setBusy(true);
    try {
      await apiJson("/api/standalone/lead-finder/auto/start", { method: "POST", body: "{}" });
      await loadStatus();
    } catch (e) {
      setMsg(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    try {
      await apiJson("/api/standalone/lead-finder/auto/stop", { method: "POST", body: "{}" });
      await loadStatus();
    } catch (e) {
      setMsg(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  const toggleCountry = (code: string) => {
    if (!settings) return;
    const has = settings.countries.includes(code);
    const next = has ? settings.countries.filter((c) => c !== code) : [...settings.countries, code];
    setSettings({ ...settings, countries: next.length ? next : ["US"] });
  };

  const running = active?.status === "running" || active?.status === "queued";
  const pct = active && Number(active.quota) > 0 ? Math.min(100, Math.round((Number(active.processed) / Number(active.quota)) * 100)) : 0;

  return (
    <section className="lf-panel">
      <p className="lf-meta">
        {zh
          ? "每天早上 5 点（上海时区）按你勾选的国家，搜索需要自己做宣传的中小微企业（店铺、工作室、批发、工厂），再用服务器上的大模型筛掉通讯录和巨头。周内已搜过的官网不会重复。有效邮箱写入 CRM，行业标签为当天日期。若今天还没有发送计划，会写一封英文模版，并交给专线 1 自动发送这批联系人。"
          : "Every day at 05:00 Asia/Shanghai, search small businesses that promote their own work in the countries you select. A model on the server drops directories and giant brands. Domains seen in the last 7 days are skipped. Valid emails import to CRM with today’s date as the industry tag. If no send plan exists yet today, one English template is saved and lane 1 sends that tag."}
      </p>

      {settings ? (
        <>
          <label className="lf-check" style={{ marginBottom: 10 }}>
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
            />
            <span>{zh ? "开启每日自动搜索" : "Enable daily auto search"}</span>
          </label>
          <div className="lf-row">
            {(
              [
                ["US", "United States"],
                ["SG", "Singapore"],
                ["GB", "United Kingdom"],
                ["DE", "Germany"],
                ["AU", "Australia"],
                ["CA", "Canada"],
                ["FR", "France"],
                ["NL", "Netherlands"],
                ["NZ", "New Zealand"],
                ["MY", "Malaysia"]
              ] as const
            ).map(([code, label]) => (
              <label className="lf-check" key={code}>
                <input type="checkbox" checked={settings.countries.includes(code)} onChange={() => toggleCountry(code)} />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <label className="lf-field">
            <span>{zh ? "每天家数" : "Daily quota"}</span>
            <input
              type="number"
              min={1}
              max={500}
              value={settings.dailyQuota}
              onChange={(e) => setSettings({ ...settings, dailyQuota: Number(e.target.value) || 200 })}
            />
          </label>
          <div className="lf-row">
            <button type="button" className="lf-btn primary" disabled={busy} onClick={() => void save()}>
              {zh ? "保存设置" : "Save"}
            </button>
            <button type="button" className="lf-btn" disabled={busy || running} onClick={() => void start()}>
              {zh ? "立即开始今天的搜索" : "Run today now"}
            </button>
            <button type="button" className="lf-btn" disabled={busy || !running} onClick={() => void stop()}>
              {zh ? "停止" : "Stop"}
            </button>
          </div>
        </>
      ) : (
        <p className="lf-meta">{zh ? "加载设置…" : "Loading…"}</p>
      )}

      {msg ? <p className="lf-status">{msg}</p> : null}

      <div className="lf-progress" style={{ marginTop: 16 }}>
        <div className="lf-sources-title">{zh ? "任务栏 · 正在搜索" : "Task bar"}</div>
        {active ? (
          <>
            <p className="lf-meta" style={{ marginBottom: 6 }}>
              {active.run_date} · {active.status} · {active.processed}/{active.quota} · CRM {active.imported} ·{" "}
              {zh ? "标签" : "tag"} {active.crm_tag}
            </p>
            <div className="lf-auto-bar">
              <div className="lf-auto-bar-fill" style={{ width: `${pct}%` }} />
            </div>
            <p className="lf-status">
              {active.current_note || active.current_domain || (zh ? "排队中…" : "Queued…")}
            </p>
          </>
        ) : (
          <p className="lf-meta">{zh ? "今天还没有任务。打开开关后明早 5 点开始，或点立即开始。" : "No job yet."}</p>
        )}
        <ul className="lf-progress-list">
          {events
            .filter((ev) => !/403|unsupported_country|request_forbidden/i.test(String(ev.note || "")))
            .map((ev, i) => (
            <li key={`${ev.created_at}-${i}`} className="lf-progress-item">
              <span className={ev.status === "error" ? "lf-err" : ev.status === "done" ? "lf-ok" : "lf-dot"}>
                {ev.status === "running" ? "…" : ev.status === "done" ? "✓" : ev.status === "error" ? "!" : "·"}
              </span>
              <span className="p-label">{ev.domain || "job"}</span>
              <span className="p-note">{ev.note}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="lf-sources" style={{ marginTop: 14 }}>
        <div className="lf-sources-title">{zh ? "历史任务 / 下载 CSV" : "History / CSV"}</div>
        <table className="lf-preview-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>{zh ? "日期" : "Date"}</th>
              <th>{zh ? "状态" : "Status"}</th>
              <th>{zh ? "进度" : "Progress"}</th>
              <th>CSV</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id}>
                <td>{j.id}</td>
                <td>{String(j.run_date).slice(0, 10)}</td>
                <td>{j.status}</td>
                <td>
                  {j.processed}/{j.quota} · CRM {j.imported}
                </td>
                <td>
                  {Number(j.has_csv) > 0 ? (
                    <button
                      type="button"
                      className="lf-btn"
                      onClick={() =>
                        void downloadAuthenticatedFile(
                          `/api/standalone/lead-finder/auto/jobs/${j.id}/csv`,
                          `lead-finder-auto-${j.id}.csv`
                        ).catch((e) => setMsg(String((e as Error).message || e)))
                      }
                    >
                      {zh ? "下载" : "Download"}
                    </button>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
            {!jobs.length ? (
              <tr>
                <td colSpan={5}>{zh ? "暂无" : "None"}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
