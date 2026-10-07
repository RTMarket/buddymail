import { apiJson } from "./api";
import { notifyEmailContactsChanged } from "./emailCrmContactsSync";

export async function bulkDeleteCrmDatabaseContacts(ids: number[]): Promise<number> {
  const uniq = Array.from(new Set(ids.filter((id) => id > 0)));
  if (uniq.length === 0) return 0;
  const res = await apiJson<{ ok: boolean; deleted?: number; message?: string }>(
    "/api/email/contacts/bulk-delete",
    {
      method: "POST",
      body: JSON.stringify({ ids: uniq })
    }
  );
  if (!res.ok) {
    throw new Error(res.message ?? "删除失败");
  }
  notifyEmailContactsChanged({ contactIds: uniq, source: "crm-database-bulk-delete" });
  return typeof res.deleted === "number" ? res.deleted : uniq.length;
}
