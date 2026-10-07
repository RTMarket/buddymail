const DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const RESERVED = new Set([
  "www",
  "ftp",
  "smtp",
  "mx",
  "imap",
  "pop",
  "pop3",
  "webmail",
  "autodiscover",
  "cdn",
  "api"
]);

export function validateDedicatedSenderDomain(senderDomain: string): string | null {
  const d = senderDomain.trim().toLowerCase();
  if (!d) return "请填写发件域名";
  if (!DOMAIN_RE.test(d)) {
    return "发件域名须为子域名格式，例如 mail.yourcompany.com";
  }
  const labels = d.split(".");
  if (labels.length < 3) {
    return "发件域名须为独立子域（至少三段），例如 mail.yourcompany.com";
  }
  const first = labels[0] ?? "";
  if (RESERVED.has(first)) {
    return `请使用专用发信子域（推荐 mail.主域.com），不要使用 ${first}. 等系统保留子域`;
  }
  return null;
}

export function validateDedicatedFromEmail(fromEmail: string, senderDomain: string): string | null {
  const email = fromEmail.trim().toLowerCase();
  const domain = senderDomain.trim().toLowerCase();
  if (!email) return "请填写发件邮箱";
  if (!EMAIL_RE.test(email)) return "发件邮箱格式不正确";
  const at = email.lastIndexOf("@");
  if (email.slice(at + 1) !== domain) {
    return `发件邮箱须为「名称@${domain}」格式，例如 marketing@${domain}`;
  }
  return null;
}

export function suggestFromEmail(senderDomain: string, localPart = "marketing"): string {
  const d = senderDomain.trim().toLowerCase();
  if (!d || !DOMAIN_RE.test(d)) return "";
  return `${localPart}@${d}`;
}
