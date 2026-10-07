/** 统计页/CRM 删除联系人后，通知邮件营销页刷新行业人数与 CRM 列表（独立站专用） */
export const BSS_EMAIL_CONTACTS_CHANGED = "bss-email-contacts-changed";

export type EmailContactsChangedDetail = {
  contactIds?: number[];
  emails?: string[];
  source?: string;
};

export function notifyEmailContactsChanged(detail: EmailContactsChangedDetail = {}): void {
  if (typeof window === "undefined") return;
  const payload: EmailContactsChangedDetail = {
    contactIds: Array.from(new Set((detail.contactIds ?? []).filter((id) => id > 0))),
    emails: Array.from(new Set((detail.emails ?? []).map((e) => String(e ?? "").trim()).filter(Boolean))),
    source: detail.source ?? "unknown"
  };
  window.dispatchEvent(new CustomEvent(BSS_EMAIL_CONTACTS_CHANGED, { detail: payload }));
}

export function subscribeEmailContactsChanged(handler: (detail: EmailContactsChangedDetail) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const fn = (ev: Event) => {
    const d = (ev as CustomEvent<EmailContactsChangedDetail>).detail ?? {};
    handler(d);
  };
  window.addEventListener(BSS_EMAIL_CONTACTS_CHANGED, fn);
  return () => window.removeEventListener(BSS_EMAIL_CONTACTS_CHANGED, fn);
}
