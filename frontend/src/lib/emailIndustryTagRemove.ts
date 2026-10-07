import { apiJson } from "./api";
import { notifyEmailContactsChanged } from "./emailCrmContactsSync";
import { hideIndustryTagFromLists } from "./emailIndustryTagStorage";

/** 移除行业标签：purge 该租户 CRM 中该行业联系人 + 全站下拉同步隐藏 */
export async function removeIndustryTagAndCrmContacts(
  userEmail: string | null | undefined,
  tag: string
): Promise<{ deleted: number; industry: string }> {
  const t = String(tag ?? "").trim();
  if (!t) return { deleted: 0, industry: "" };
  const res = await apiJson<{ ok: boolean; deleted: number; industry: string }>(
    "/api/email/contacts/purge-by-industry",
    { method: "POST", body: JSON.stringify({ industry: t }) }
  );
  const deleted = Math.max(0, Number(res.deleted ?? 0));
  hideIndustryTagFromLists(userEmail, t);
  notifyEmailContactsChanged({ source: "industry-tag-remove" });
  return { deleted, industry: t };
}
