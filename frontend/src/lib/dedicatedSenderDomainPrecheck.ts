import { apiJson } from "./api";

export type DedicatedSenderPrecheckResult = {
  ok: boolean;
  hardErrors: string[];
  warnings: string[];
  mxHosts: string[];
};

export async function fetchDedicatedSenderDomainPrecheck(
  senderDomain: string,
  fromEmail?: string
): Promise<DedicatedSenderPrecheckResult> {
  const params = new URLSearchParams({ domain: senderDomain.trim() });
  if (fromEmail?.trim()) params.set("fromEmail", fromEmail.trim());
  const r = await apiJson<{ ok: boolean } & DedicatedSenderPrecheckResult>(
    `/api/email/dedicated-servers/precheck-sender-domain?${params.toString()}`
  );
  return {
    ok: Boolean(r.ok && r.hardErrors?.length === 0),
    hardErrors: Array.isArray(r.hardErrors) ? r.hardErrors : [],
    warnings: Array.isArray(r.warnings) ? r.warnings : [],
    mxHosts: Array.isArray(r.mxHosts) ? r.mxHosts : []
  };
}
