import nodemailer from "nodemailer";
import type { Env } from "../env.js";

const DEFAULT_FROM = process.env.AUTH_EMAIL_FROM || "noreply@example.com";

/** 套餐开通通知、到期提醒等仍走 SMTP，与验证码通道无关 */
export function isAuthEmailSmtpConfigured(env: Env): boolean {
  return Boolean(
    env.AUTH_EMAIL_SMTP_HOST?.trim() &&
      env.AUTH_EMAIL_SMTP_USER?.trim() &&
      env.AUTH_EMAIL_SMTP_PASS?.trim()
  );
}

/** 开源版：仅 SMTP 通道 */
export function isAuthEmailOtpConfigured(env: Env): boolean {
  return isAuthEmailSmtpConfigured(env);
}

export function createAuthEmailTransporter(env: Env) {
  if (!isAuthEmailSmtpConfigured(env)) {
    throw new Error("未配置 AUTH_EMAIL_SMTP_HOST / AUTH_EMAIL_SMTP_USER / AUTH_EMAIL_SMTP_PASS");
  }
  const host = env.AUTH_EMAIL_SMTP_HOST!.trim();
  const allowSelfSigned =
    process.env.SMTP_TLS_ALLOW_SELF_SIGNED === "1" ||
    process.env.SMTP_TLS_ALLOW_SELF_SIGNED === "true";
  return nodemailer.createTransport({
    host,
    port: env.AUTH_EMAIL_SMTP_PORT,
    secure: env.AUTH_EMAIL_SMTP_SECURE,
    /** 腾讯云邮件推送等国内服务在部分链路上对 PLAIN 不友好，显式 LOGIN 更稳 */
    authMethod: "LOGIN",
    ...(env.AUTH_EMAIL_SMTP_PORT === 587 ? { requireTLS: true } : {}),
    tls: {
      minVersion: "TLSv1.2" as const,
      servername: host,
      ...(allowSelfSigned ? { rejectUnauthorized: false } : {})
    },
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    auth: {
      user: env.AUTH_EMAIL_SMTP_USER!.trim(),
      pass: env.AUTH_EMAIL_SMTP_PASS!.trim()
    }
  });
}

async function sendAuthEmailOtpViaSmtp(
  env: Env,
  toEmail: string,
  code: string,
  purpose: "register" | "reset_password",
  ttlMinutes: number
): Promise<void> {
  const from = (env.AUTH_EMAIL_FROM?.trim() || DEFAULT_FROM).toLowerCase();
  const transport = createAuthEmailTransporter(env);
  const subject =
    purpose === "register"
      ? `BuddyMail 注册验证码：${code}`
      : `BuddyMail 重置密码验证码：${code}`;
  const actionLabel = purpose === "register" ? "注册" : "重置密码";
  await transport.sendMail({
    from: `"BuddyMail" <${from}>`,
    to: toEmail,
    subject,
    text: `您正在${actionLabel}，验证码是 ${code}，${ttlMinutes} 分钟内有效。如非本人操作请忽略本邮件。`,
    html: `<p style="font-family:system-ui,sans-serif;font-size:15px;color:#111">您正在${actionLabel}，验证码是</p>
<p style="font-family:ui-monospace,monospace;font-size:22px;font-weight:700;letter-spacing:0.25em;color:#0f172a">${code}</p>
<p style="font-family:system-ui,sans-serif;font-size:13px;color:#64748b">${ttlMinutes} 分钟内有效。如非本人操作请忽略本邮件。</p>`
  });
}

export async function sendAuthEmailOtp(
  env: Env,
  toEmail: string,
  code: string,
  purpose: "register" | "reset_password",
  ttlMinutes = 30
): Promise<void> {
  // 开源版：仅支持 SMTP 通道（商业版 aoksend/腾讯云通道已移除）
  if (!isAuthEmailSmtpConfigured(env)) {
    throw new Error(
      "未配置验证码发信：请设置 AUTH_EMAIL_SMTP_HOST、AUTH_EMAIL_SMTP_USER、AUTH_EMAIL_SMTP_PASS。"
    );
  }
  return sendAuthEmailOtpViaSmtp(env, toEmail, code, purpose, ttlMinutes);
}
