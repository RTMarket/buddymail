/** send-contacts 名单 tab 筛选 SQL 片段（可单测） */

export type SendListSliceTab = "opened" | "success" | "failed";

export function sendContactsTabFilterSql(tab: SendListSliceTab | string | undefined): string {
  if (tab === "opened") return " AND agg.open_count > 0";
  if (tab === "success") return " AND GREATEST(0, agg.send_count - agg.bounce_like_count) > 0";
  if (tab === "failed") return " AND agg.bounce_like_count > 0";
  return "";
}
