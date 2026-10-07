/**
 * SMTP AUTH 登录名：优先 `smtp_profiles.username`，为空则回退 `from_email`（Dovecot 常为完整邮箱）。
 */
export function resolveSmtpAuthUser(smtp: { username?: unknown; from_email?: unknown }): string {
  const u = String(smtp.username ?? "").trim();
  if (u.length > 0) return u;
  return String(smtp.from_email ?? "").trim();
}

/** 独立 VPS 自签证书：SMTP / IMAP 共用此开关关闭 TLS 证书校验 */
export function isMailTlsAllowSelfSigned(): boolean {
  return (
    process.env.SMTP_TLS_ALLOW_SELF_SIGNED === "1" ||
    process.env.SMTP_TLS_ALLOW_SELF_SIGNED === "true" ||
    process.env.BOUNCE_IMAP_TLS_ALLOW_SELF_SIGNED === "1" ||
    process.env.BOUNCE_IMAP_TLS_ALLOW_SELF_SIGNED === "true"
  );
}

/**
 * Nodemailer：`secure=true` = 隐式 TLS（465）；587 须 `secure=false` + STARTTLS。
 *
 * 独立 VPS 自签证书：仅当 `SMTP_TLS_ALLOW_SELF_SIGNED=1|true` 时关闭 TLS 证书校验。
 *
 * @see https://nodemailer.com/smtp/
 */
export function nodemailerTransportFromSmtpRow(
  smtp: { host: string; port: number | string | null | undefined; secure?: unknown },
  auth: { user: string; pass: string },
  extras: Record<string, unknown> = {}
): Record<string, unknown> {
  /** MySQL 常把 port 置为 NULL；Number(null)===0、Number(undefined)===NaN，会导致误判端口从而错误启用 secure→TLS，触发 openssl wrong version number */
  const raw = Number(smtp.port);
  const port = Number.isFinite(raw) && raw > 0 ? raw : 587;

  const secure =
    port === 465
      ? true
      : port === 587 || port === 25 || port === 2525
        ? false
        : Boolean(smtp.secure);

  const allowSelfSigned = isMailTlsAllowSelfSigned();

  return {
    host: String(smtp.host),
    port,
    secure,
    auth,
    ...(port === 587 ? { requireTLS: true } : {}),
    ...(allowSelfSigned ? { tls: { rejectUnauthorized: false } } : {}),
    ...extras
  };
}
