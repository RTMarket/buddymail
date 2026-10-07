import type { DedicatedDnsPanelRow, DedicatedDnsRecordInput } from "./dedicatedDnsPanelDisplay";
import { toDedicatedDnsPanelRow } from "./dedicatedDnsPanelDisplay";

/** http 独立站下 navigator.clipboard 常不可用，execCommand 兜底 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  const payload = text.trim();
  if (!payload) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(payload);
      return true;
    }
  } catch {
    /** fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = payload;
    ta.setAttribute("readonly", "true");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function formatDnsPanelRowForClipboard(
  panel: DedicatedDnsPanelRow,
  opts?: { index?: number; kindLabel?: string }
): string {
  const head =
    opts?.index != null
      ? `#${opts.index + 1}${opts.kindLabel ? ` ${opts.kindLabel}` : ""}`
      : null;
  const lines = [
    head,
    `主机记录: ${panel.hostRecord}`,
    `完整主机: ${panel.fqdnHost}`,
    `类型: ${panel.type}`,
    panel.type === "MX" && panel.mxPriority != null ? `MX 优先级: ${panel.mxPriority}` : null,
    `记录值: ${panel.value}`,
    panel.note ? `说明: ${panel.note}` : null
  ].filter(Boolean) as string[];
  return lines.join("\n");
}

export function formatAllDnsRecordsForClipboard(
  records: DedicatedDnsRecordInput[],
  senderDomain?: string | null,
  kindLabelFor?: (rec: DedicatedDnsRecordInput, panelType: string) => string
): string {
  return records
    .map((rec, i) => {
      const panel = toDedicatedDnsPanelRow(rec, senderDomain);
      const kind = kindLabelFor?.(rec, panel.type);
      return formatDnsPanelRowForClipboard(panel, { index: i, kindLabel: kind });
    })
    .join("\n\n");
}

export function selectElementText(el: HTMLInputElement | HTMLTextAreaElement | null) {
  if (!el) return;
  el.focus();
  el.select();
}
