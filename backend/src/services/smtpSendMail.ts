import type nodemailer from "nodemailer";

/** 单封 SMTP：超过此时长未发出即失败，继续下一封。默认放宽，避免慢 VPS/SMTP 被误判为失败。 */
export const CAMPAIGN_SMTP_SEND_TIMEOUT_MS = Math.max(
  6_000,
  Math.min(120_000, Number(process.env.CAMPAIGN_SMTP_SEND_TIMEOUT_MS || 30_000))
);

const DEFAULT_SEND_MAIL_TIMEOUT_MS = CAMPAIGN_SMTP_SEND_TIMEOUT_MS;

export function campaignSmtpSendTimeoutMs(): number {
  return DEFAULT_SEND_MAIL_TIMEOUT_MS;
}

/** 硬超时：避免 VPS/Postfix 无响应时 email_sends 长期停在 sending */
export async function sendMailWithTimeout(
  transporter: nodemailer.Transporter,
  mailOptions: nodemailer.SendMailOptions,
  timeoutMs = DEFAULT_SEND_MAIL_TIMEOUT_MS
): Promise<nodemailer.SentMessageInfo> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      transporter.sendMail(mailOptions),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error(
              `SMTP 发送超时（${Math.round(timeoutMs / 1000)} 秒）。请检查 VPS 是否在线、Postfix 是否监听、587/465 防火墙与安全组是否放行。`
            )
          );
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** 包装可能卡死的 SMTP 建连/校验，避免监控长期停在「连接发信服务器」 */
export async function runWithTimeout<T>(
  work: () => Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function verifySmtpWithTimeout(
  transporter: nodemailer.Transporter,
  timeoutMs = DEFAULT_SEND_MAIL_TIMEOUT_MS
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      transporter.verify(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`SMTP 连接校验超时（${Math.round(timeoutMs / 1000)} 秒），VPS 可能不可达或端口未开放。`));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
