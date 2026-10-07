import { useState } from "react";
import {
  toDedicatedDnsPanelRow,
  type DedicatedDnsRecordInput
} from "../../../lib/dedicatedDnsPanelDisplay";

function dnsTypeLabel(type: string): string {
  const t = type.trim().toUpperCase();
  if (t === "TXT" && !type.includes("domainkey")) return "TXT";
  return t;
}

function recordKindLabel(rec: DedicatedDnsRecordInput, panelType: string): string {
  const host = rec.host.toLowerCase();
  if (panelType === "TXT" && host.includes("_domainkey.")) return "DKIM";
  if (panelType === "TXT" && host.startsWith("_dmarc.")) return "DMARC";
  if (panelType === "TXT") return "SPF";
  if (panelType === "A") return "A";
  if (panelType === "MX") return "MX";
  return panelType;
}

export function DedicatedDnsRecordsSummaryTable(props: {
  records: DedicatedDnsRecordInput[];
  senderDomain?: string | null;
  compact?: boolean;
}) {
  const { records, senderDomain, compact } = props;
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1200);
    } catch {
      /** ignore */
    }
  }

  if (records.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-[11px] text-slate-500">
        填写发信机 / PTR IP 后点击「生成 DNS」，或保存已有 JSON。单机模式显示 5 条，双机模式显示 6 条清单预览。
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
      <table className={`w-full min-w-[520px] border-collapse text-left ${compact ? "text-[10px]" : "text-[11px]"}`}>
        <thead>
          <tr className="bg-slate-100 text-slate-700">
            <th className="px-2 py-1.5 font-medium">#</th>
            <th className="px-2 py-1.5 font-medium">用途</th>
            <th className="px-2 py-1.5 font-medium">主机记录</th>
            <th className="px-2 py-1.5 font-medium">类型</th>
            <th className="px-2 py-1.5 font-medium">MX</th>
            <th className="px-2 py-1.5 font-medium">记录值</th>
            <th className="px-2 py-1.5 font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          {records.map((rec, i) => {
            const panel = toDedicatedDnsPanelRow(rec, senderDomain);
            const kind = recordKindLabel(rec, panel.type);
            const copyKey = `${i}-${panel.type}`;
            return (
              <tr key={copyKey} className="border-t border-slate-100 align-top">
                <td className="px-2 py-1.5 tabular-nums text-slate-500">{i + 1}</td>
                <td className="px-2 py-1.5 font-medium text-slate-800">{kind}</td>
                <td className="px-2 py-1.5">
                  <div className="font-mono text-slate-900">{panel.hostRecord}</div>
                  {!compact ? (
                    <div className="mt-0.5 text-[10px] text-slate-400">{panel.fqdnHost}</div>
                  ) : null}
                </td>
                <td className="px-2 py-1.5 font-mono">{dnsTypeLabel(panel.type)}</td>
                <td className="px-2 py-1.5 font-mono text-slate-700">
                  {panel.type === "MX" && panel.mxPriority != null ? panel.mxPriority : "—"}
                </td>
                <td className="max-w-[200px] px-2 py-1.5">
                  <div className="break-all font-mono text-slate-900" title={panel.value}>
                    {panel.type === "TXT" && panel.value.length > 48
                      ? `${panel.value.slice(0, 48)}…`
                      : panel.value}
                  </div>
                </td>
                <td className="px-2 py-1.5">
                  <button
                    type="button"
                    className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] hover:bg-slate-100"
                    onClick={() =>
                      void copy(
                        panel.type === "MX"
                          ? String(panel.mxPriority ?? 10)
                          : panel.value,
                        `${copyKey}-val`
                      )
                    }
                  >
                    {copiedKey === `${copyKey}-val` ? "✓" : "复制值"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
