import crypto from "node:crypto";
import { env } from "../env.js";

/**
 * AWS SES Identity 抽象层。
 *
 * 设计思路：
 * - 本服务封装"创建/查询/删除 SES email identity"的所有操作，对调用方（路由层）
 *   隐藏真 AWS 与 mock 之间的差异。
 * - env.AWS_SES_ENABLED = false（默认）：跑在 mock 模式，所有结果都是确定性派生
 *   （由域名 hash 出 3 个 DKIM token，验证状态由"创建时间 + 自动验证延迟"自动翻 success），
 *   方便前端 / 集成测试开发。
 * - env.AWS_SES_ENABLED = true：调用 @aws-sdk/client-sesv2 走真 AWS。注意 SDK 是动态
 *   import，避免 mock 用户没装依赖也能起服务。
 *
 * 切换风险：
 * - 真模式下 verifyEmailIdentity / deleteEmailIdentity 会扣 SES 配额、并影响声誉，
 *   所以 mock → 真 切换只能由部署侧通过 env 控制，不允许业务代码逐租户开关。
 */

export type SesIdentityKind = "domain" | "email";

export interface CreateIdentityResult {
  /** 真模式：SES Identity ARN；mock 模式：mock-identity://<sha1> */
  identityArn: string;
  /** 域名身份才有，3 条 token；email 身份返回空数组 */
  dkimTokens: string[];
  /** 当前在 SES 那边查到的状态：mock 模式总是 'pending' */
  initialStatus: "pending" | "verified" | "failed";
}

export interface IdentityStatus {
  identityArn: string;
  /** 综合状态（接近真 SES verificationStatus + dkim verificationStatus 的聚合） */
  overall: "pending" | "verifying" | "verified" | "failed" | "deleted";
  dkimStatus: "unknown" | "pass" | "fail";
  /** 真模式下 SES 直接告诉我们是否拿到 SPF（mail-from 域）；mock 模式按 hash 模拟 */
  mailFromStatus?: "unknown" | "pass" | "fail";
  /** 真模式下来源是 SES API；mock 模式由 createdAt + AWS_SES_MOCK_AUTO_VERIFY_SECONDS 决定 */
  failureReason?: string;
}

export interface SendEmailInput {
  fromAddress: string;     /** 完整地址，例 "Acme Sales <info@mail.acme.com>" */
  toAddresses: string[];
  replyToAddress?: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
  /** 用于 SES configuration set 路由（统计 / 退信） */
  configurationSet?: string;
  /** 自定义 tag，便于按租户/活动统计；mock 模式忽略 */
  tags?: Record<string, string>;
}

export interface SendEmailResult {
  /** 真模式 = SES MessageId；mock 模式 = mock-msg-<rand> */
  messageId: string;
  /** mock 模式可能模拟出 5xx 拒收以便测试熔断流；真模式由 AWS 抛错 */
  accepted: boolean;
}

/**
 * 公共入口：返回当前是否运行在 mock 模式。供路由 / 前端 health 接口判断展示口径。
 *
 * 注意：即使部署侧已经把 AWS_SES_ENABLED 打开，但只要 access key / secret 还没填齐，
 * 我们也会自动 fallback 到 mock。否则 SDK 会用匿名请求打 SES，AWS 返回非 JSON 错误页，
 * 前端就会看到 "Unexpected end of JSON input" 这种没法理解的报错。
 *
 * 这种 fallback 只在 dev 期间临时生效——部署侧把 AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
 * 一填好就自动走真 SES，不需要任何代码或前端改动。
 */
let _missingCredsWarned = false;
export function isSesMockMode(): boolean {
  if (!env.AWS_SES_ENABLED) return true;
  const hasCreds = Boolean(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY);
  if (!hasCreds) {
    if (!_missingCredsWarned) {
      _missingCredsWarned = true;
      // eslint-disable-next-line no-console
      console.warn(
        "[ses] AWS_SES_ENABLED=true 但 AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY 未配置；" +
          "暂时降级为 mock 模式（DKIM token 由域名 hash 派生），等凭证配齐后会自动切换到真 SES。"
      );
    }
    return true;
  }
  return false;
}

/**
 * 给定一个域名，生成 3 个稳定 DKIM token。真模式下直接走 SES，mock 模式用 sha1 派生
 * 保证同一域名每次结果一致（这样前端展示的 DNS 记录复制粘贴指引不会"刷新就变值"）。
 */
function deriveMockDkimTokens(domain: string): string[] {
  const norm = domain.trim().toLowerCase();
  return [0, 1, 2].map((idx) => {
    const h = crypto.createHash("sha1").update(`bss-mock-dkim:${norm}:${idx}`).digest("hex");
    return h.slice(0, 32);
  });
}

function deriveMockIdentityArn(kind: SesIdentityKind, value: string): string {
  const norm = value.trim().toLowerCase();
  return `mock-identity://${kind}/${norm}`;
}

/**
 * 创建 SES email/domain identity。
 *   - mock: 立即返回伪 ARN + 3 个稳定 DKIM token，状态 pending
 *   - 真: 调用 sesv2.CreateEmailIdentity，配置 EasyDKIM，返回 SES 给的 token
 *
 * 调用方应当把 dkimTokens 持久化到 email_sender_domains.dkim_tokens_json，
 * 后续展示给用户复制粘贴；ARN 存到 ses_identity_arn 用作幂等 key。
 */
export async function createIdentity(
  kind: SesIdentityKind,
  value: string,
  opts?: { mailFromDomain?: string }
): Promise<CreateIdentityResult> {
  if (isSesMockMode()) {
    return {
      identityArn: deriveMockIdentityArn(kind, value),
      dkimTokens: kind === "domain" ? deriveMockDkimTokens(value) : [],
      initialStatus: "pending"
    };
  }
  return await callSesCreateIdentity(kind, value, opts);
}

/**
 * 查询 identity 当前状态：DKIM 是否生效、SPF/MailFrom 是否生效。
 *   - mock: 根据 createdAt 距今的秒数决定状态：
 *           < AWS_SES_MOCK_AUTO_VERIFY_SECONDS  → verifying
 *           >= AWS_SES_MOCK_AUTO_VERIFY_SECONDS → verified
 *           （这样集成测试可以等 30 秒看到从 pending 翻 success 的全流程）
 *   - 真: 调用 sesv2.GetEmailIdentity，把 SES 的 verificationStatus 翻译成我们的枚举
 *
 * 调用方应在收到 verified 之后写 verified_at + 把 status 翻成 verified；
 * failed 的话写 failure_reason 让前端展示给用户。
 */
export async function getIdentityStatus(
  kind: SesIdentityKind,
  value: string,
  opts: { createdAt: Date }
): Promise<IdentityStatus> {
  if (isSesMockMode()) {
    const ageSec = Math.max(0, Math.floor((Date.now() - opts.createdAt.getTime()) / 1000));
    const threshold = Math.max(0, Number(env.AWS_SES_MOCK_AUTO_VERIFY_SECONDS));
    const verified = ageSec >= threshold;
    return {
      identityArn: deriveMockIdentityArn(kind, value),
      overall: verified ? "verified" : "verifying",
      dkimStatus: verified ? "pass" : "unknown",
      mailFromStatus: verified ? "pass" : "unknown"
    };
  }
  return await callSesGetIdentity(kind, value);
}

/**
 * 删除 identity（用户在前端"删除域名"时调用）。
 *   - mock: 立即返回 ok
 *   - 真: 调用 sesv2.DeleteEmailIdentity；删完之后该域名再发邮件 SES 会拒收
 *
 * 注意：删除并不会从 SES suppression list（hard bounce 列表）里清除收件人，
 * 那是不同的概念。suppression list 由 ses_suppression_log 维护。
 */
export async function deleteIdentity(kind: SesIdentityKind, value: string): Promise<void> {
  if (isSesMockMode()) return;
  await callSesDeleteIdentity(kind, value);
}

/**
 * 发送邮件。
 *   - mock: 95% 概率"成功"，5% 概率随机一个 fake bounce / complaint，
 *           便于调试熔断引擎；不实际投递任何邮件
 *   - 真: 调用 sesv2.SendEmail，带 configuration set + tags
 *
 * 返回 messageId 应当持久化到 email_sends 行，便于后续 SNS 退信回调按 messageId 关联。
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (isSesMockMode()) {
    /**
     * mock 模式发送成功率 95%，剩下 5% 模拟 bounce/complaint。
     * 这样可以在 dev 环境验证熔断引擎和 suppression 流，而不用等真实退信。
     */
    const rand = Math.random();
    if (rand < 0.95) {
      return {
        messageId: `mock-msg-${crypto.randomBytes(8).toString("hex")}`,
        accepted: true
      };
    }
    throw new Error(
      rand < 0.98
        ? "[mock SES] simulated bounce: 550 mailbox unavailable"
        : "[mock SES] simulated complaint: recipient marked as spam"
    );
  }
  return await callSesSendEmail(input);
}

// ============================================================
// 真 AWS SES SDK 调用层（仅在 AWS_SES_ENABLED=true 时被加载）
// ============================================================
//
// 这里使用动态 import("@aws-sdk/client-sesv2")，避免：
//   1) mock 用户没装 aws-sdk 也能起服务
//   2) 启动期 npm install 失败时不会影响其他路由
// 真正接入时记得 cd backend && npm i @aws-sdk/client-sesv2

async function callSesCreateIdentity(
  kind: SesIdentityKind,
  value: string,
  opts?: { mailFromDomain?: string }
): Promise<CreateIdentityResult> {
  const sdk = await loadSesSdk();
  const cmd = new sdk.CreateEmailIdentityCommand({
    EmailIdentity: value,
    DkimSigningAttributes: { NextSigningKeyLength: "RSA_2048_BIT" }
  });
  const r = await sdk.client.send(cmd);
  /**
   * SES 返回的 DkimAttributes.Tokens 即为 3 个 DKIM token，
   * CNAME 指向：<token>._domainkey.<domain> -> <token>.dkim.amazonses.com
   */
  const tokens =
    kind === "domain" && r.DkimAttributes?.Tokens && Array.isArray(r.DkimAttributes.Tokens)
      ? r.DkimAttributes.Tokens
      : [];
  /**
   * 可选：开启 Custom MAIL FROM 让 SPF 通过用户子域，进一步提升送达率。
   * 这里只在用户显式提供 mailFromDomain 时调用，避免每个域名都强制要求。
   */
  if (kind === "domain" && opts?.mailFromDomain) {
    try {
      const mfCmd = new sdk.PutEmailIdentityMailFromAttributesCommand({
        EmailIdentity: value,
        MailFromDomain: opts.mailFromDomain,
        BehaviorOnMxFailure: "USE_DEFAULT_VALUE"
      });
      await sdk.client.send(mfCmd);
    } catch {
      // 不致命，主域 identity 已建好；用户可以稍后再单独配 mail-from
    }
  }
  return {
    identityArn: deriveIdentityArnFromName(kind, value),
    dkimTokens: tokens,
    initialStatus: "pending"
  };
}

async function callSesGetIdentity(kind: SesIdentityKind, value: string): Promise<IdentityStatus> {
  const sdk = await loadSesSdk();
  const cmd = new sdk.GetEmailIdentityCommand({ EmailIdentity: value });
  try {
    const r = await sdk.client.send(cmd);
    const verificationStatus = String(r.VerificationStatus ?? "").toUpperCase();
    const dkim = String(r.DkimAttributes?.Status ?? "").toUpperCase();
    const mfStatus = String(r.MailFromAttributes?.MailFromDomainStatus ?? "").toUpperCase();
    return {
      identityArn: deriveIdentityArnFromName(kind, value),
      overall: mapSesVerification(verificationStatus, dkim),
      dkimStatus: mapSesDkim(dkim),
      mailFromStatus: mapSesMailFrom(mfStatus),
      failureReason:
        verificationStatus === "FAILED"
          ? "SES 报告身份验证失败，请检查 DNS 是否完整生效"
          : undefined
    };
  } catch (e: any) {
    /**
     * SES 在身份未创建时会抛 NotFoundException；前端可视为"重新创建"。
     */
    if (String(e?.name ?? "") === "NotFoundException") {
      return {
        identityArn: deriveIdentityArnFromName(kind, value),
        overall: "deleted",
        dkimStatus: "unknown",
        mailFromStatus: "unknown",
        failureReason: "SES 中找不到该身份；可能已被删除，请重新创建"
      };
    }
    throw e;
  }
}

async function callSesDeleteIdentity(kind: SesIdentityKind, value: string): Promise<void> {
  const sdk = await loadSesSdk();
  const cmd = new sdk.DeleteEmailIdentityCommand({ EmailIdentity: value });
  try {
    await sdk.client.send(cmd);
  } catch (e: any) {
    if (String(e?.name ?? "") === "NotFoundException") return; // 幂等
    throw e;
  }
}

async function callSesSendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const sdk = await loadSesSdk();
  const cmd = new sdk.SendEmailCommand({
    FromEmailAddress: input.fromAddress,
    Destination: { ToAddresses: input.toAddresses },
    ReplyToAddresses: input.replyToAddress ? [input.replyToAddress] : undefined,
    Content: {
      Simple: {
        Subject: { Charset: "UTF-8", Data: input.subject },
        Body: {
          Html: { Charset: "UTF-8", Data: input.htmlBody },
          ...(input.textBody ? { Text: { Charset: "UTF-8", Data: input.textBody } } : {})
        }
      }
    },
    ConfigurationSetName: input.configurationSet ?? env.AWS_SES_CONFIGURATION_SET ?? undefined,
    EmailTags: input.tags
      ? Object.entries(input.tags).map(([k, v]) => ({ Name: k, Value: String(v) }))
      : undefined
  });
  const r = await sdk.client.send(cmd);
  return { messageId: String(r.MessageId ?? ""), accepted: !!r.MessageId };
}

/**
 * 把 SES 的 verificationStatus + DKIM status 合成我们的枚举。
 * 关键决策：DKIM 没通过即视为整体未通过（即使 SES 那边整体说 SUCCESS——一些情况下
 * SES 在 DKIM 还没生效时也会报 SUCCESS，这是 SES 的内部时序差异，我们以 DKIM 为准）。
 */
function mapSesVerification(
  verification: string,
  dkim: string
): IdentityStatus["overall"] {
  if (verification === "SUCCESS" && dkim === "SUCCESS") return "verified";
  if (verification === "FAILED") return "failed";
  return "verifying";
}
function mapSesDkim(dkim: string): IdentityStatus["dkimStatus"] {
  if (dkim === "SUCCESS") return "pass";
  if (dkim === "FAILED") return "fail";
  return "unknown";
}
function mapSesMailFrom(mf: string): NonNullable<IdentityStatus["mailFromStatus"]> {
  if (mf === "SUCCESS") return "pass";
  if (mf === "FAILED" || mf === "TEMPORARY_FAILURE") return "fail";
  return "unknown";
}

function deriveIdentityArnFromName(kind: SesIdentityKind, value: string): string {
  /**
   * 生产中我们其实有完整 ARN，但 ARN 里要带 accountId，调用方很少需要 region/account 拼接，
   * 这里返回相对 identity URI，前端展示用 + DB 唯一性约束都够用。
   */
  return `ses-identity://${kind}/${value.trim().toLowerCase()}`;
}

// 只在第一次真模式调用时加载 SDK，缓存 client。
let _sdkPromise: Promise<{
  client: any;
  CreateEmailIdentityCommand: any;
  GetEmailIdentityCommand: any;
  DeleteEmailIdentityCommand: any;
  PutEmailIdentityMailFromAttributesCommand: any;
  SendEmailCommand: any;
}> | null = null;

async function loadSesSdk() {
  if (_sdkPromise) return _sdkPromise;
  _sdkPromise = (async () => {
    /**
     * 只用 import name 用的字符串变量包一下，避免 TypeScript / Vite 在编译期解析这个
     * 模块名（mock 用户根本没装这个包，编译期解析会报错）。
     */
    const modName = "@aws-sdk/client-sesv2";
    const mod: any = await import(/* @vite-ignore */ modName);
    const SESv2Client = mod.SESv2Client;
    const client = new SESv2Client({
      region: env.AWS_REGION,
      credentials:
        env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
          ? { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY }
          : undefined
    });
    return {
      client,
      CreateEmailIdentityCommand: mod.CreateEmailIdentityCommand,
      GetEmailIdentityCommand: mod.GetEmailIdentityCommand,
      DeleteEmailIdentityCommand: mod.DeleteEmailIdentityCommand,
      PutEmailIdentityMailFromAttributesCommand: mod.PutEmailIdentityMailFromAttributesCommand,
      SendEmailCommand: mod.SendEmailCommand
    };
  })();
  return _sdkPromise;
}

/**
 * 公共工具：给定域名，构造前端要展示的 DNS 记录列表（DKIM CNAME + 推荐的 SPF/DMARC TXT）。
 * 路由层调用，避免前端硬编码 DNS 模板。
 */
export function buildDnsRecordsForDomain(
  domain: string,
  dkimTokens: string[]
): Array<{
  category: "DKIM" | "SPF" | "DMARC" | "MAIL_FROM_MX" | "MAIL_FROM_TXT";
  required: boolean;
  type: "CNAME" | "TXT" | "MX";
  host: string;
  value: string;
  hint?: string;
}> {
  const recs: ReturnType<typeof buildDnsRecordsForDomain> = [];
  for (const t of dkimTokens) {
    recs.push({
      category: "DKIM",
      required: true,
      type: "CNAME",
      host: `${t}._domainkey.${domain}`,
      value: `${t}.dkim.amazonses.com`,
      hint: "DKIM 必须，3 条都加；用于 SES 给您的邮件自动签名，提升送达率并防伪造。"
    });
  }
  recs.push({
    category: "SPF",
    required: false,
    type: "TXT",
    host: domain,
    value: `"v=spf1 include:amazonses.com ~all"`,
    hint:
      "推荐：SPF 让收件方知道哪些 IP 可以代表您发信。如果该域已有 SPF 记录，请把 include:amazonses.com 合并进去，**不要建第二条**。"
  });
  recs.push({
    category: "DMARC",
    required: false,
    type: "TXT",
    host: `_dmarc.${domain}`,
    value: `"v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@${domain};"`,
    hint: "推荐：DMARC 告诉收件方 SPF/DKIM 都没过时怎么处理。新域名建议先用 p=quarantine，观察一段时间后再升 p=reject。"
  });
  return recs;
}
