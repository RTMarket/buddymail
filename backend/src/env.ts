import { z } from "zod";

/** 去掉 BOM/零宽字符与弯引号外层包裹（用于支付宝密钥、AUTH_EMAIL_SMTP_* 等） */
function normalizeAlipayKeyEnvString(raw: string): string {
  let s = raw.replace(/^\uFEFF/, "").replace(/\u200b/g, "").trim();
  const pairs: ReadonlyArray<[string, string]> = [
    ['"', '"'],
    ["\u201c", "\u201d"],
    ["\u2018", "\u2019"],
  ];
  for (const [a, b] of pairs) {
    if (s.startsWith(a) && s.endsWith(b) && s.length >= a.length + b.length) {
      s = s.slice(a.length, -b.length).trim();
      break;
    }
  }
  return s;
}

export const env = z
  .object({
    PORT: z.coerce.number().default(8787),
    /** 多个源用英文逗号分隔；需覆盖 localhost 与 127.0.0.1 两种访问方式 */
    CORS_ORIGIN: z
      .string()
      .default(
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173"
      ),

    MYSQL_HOST: z.string().default("127.0.0.1"),
    MYSQL_PORT: z.coerce.number().default(3306),
    MYSQL_USER: z.string().default("root"),
    MYSQL_PASSWORD: z.string().default(""),
    MYSQL_DATABASE: z.string().default("bigsocialboss"),

    // Used to encrypt SMTP passwords at rest (recommended). If empty, passwords are stored with a plaintext prefix (dev only).
    CREDENTIALS_SECRET: z.string().optional(),
    /** site-visit 挑战签名；不填则回退 CREDENTIALS_SECRET */
    SITE_VISIT_SIGNING_SECRET: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().optional()
    ),

    ABSTRACT_EMAIL_VALIDATION_KEY: z.string().optional(),

    /**
     * 注册是否必须邮箱 6 位验证码。为 false 时注册仅校验邮箱可达（见 AUTH_REGISTER_EMAIL_MX_REQUIRED 与 ABSTRACT_EMAIL_VALIDATION_KEY），忘记密码仍走验证码。
     * 临时应急用：无验证码时无法证明邮箱归属，生产请谨慎。
     */
    AUTH_REGISTER_EMAIL_OTP_REQUIRED: z.preprocess((v) => {
      if (v === "false" || v === "0" || v === "no") return false;
      return true;
    }, z.boolean()),
    /** 无验证码注册时是否要求域名存在 MX 记录（建议保持 true） */
    AUTH_REGISTER_EMAIL_MX_REQUIRED: z.preprocess((v) => {
      if (v === "false" || v === "0" || v === "no") return false;
      return true;
    }, z.boolean()),

    /** 若设置，POST /api/leads/search 将把请求体 JSON 转发到该 URL，并期望返回 { items: [...] } */
    LEADS_SEARCH_API_URL: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().url().optional()
    ),
    LEADS_SEARCH_API_KEY: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().optional()
    ),

    // AI (optional; used by /api/ai/*)
    AI_PROVIDER: z.enum(["openai", "deepseek"]).default("openai"),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_BASE_URL: z.string().default("https://api.openai.com/v1"),
    OPENAI_MODEL: z.string().default("gpt-4o-mini"),
    OPENAI_IMAGE_MODEL: z.string().default("gpt-image-1"),
    /** 文案创作 /api/content/copy/ai/generate：限制输出长度，越小越快（约 1 中文≈1~2 token） */
    OPENAI_COPY_MAX_TOKENS: z.coerce.number().int().min(128).max(8192).default(768),
    OPENAI_COPY_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.45),

    DEEPSEEK_API_KEY: z.string().optional(),
    DEEPSEEK_BASE_URL: z.string().default("https://api.deepseek.com/v1"),
    DEEPSEEK_MODEL: z.string().default("deepseek-chat"),

    // Stripe billing (SaaS)
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_SUCCESS_URL: z.string().optional(),
    STRIPE_CANCEL_URL: z.string().optional(),
    STRIPE_PORTAL_RETURN_URL: z.string().optional(),
    ADMIN_BOOTSTRAP_KEY: z.string().optional(),
    ADMIN_LOGIN_EMAIL: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().email().optional()
    ),
    ADMIN_LOGIN_PASSWORD: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().min(6).max(64).optional()
    ),
    ADMIN_LOGIN_NICKNAME: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().min(1).max(120).optional()
    ),
    /** 防护监测可信邮箱（逗号分隔），与 ADMIN_LOGIN_EMAIL 一并不计入「严重/高风险」 */
    SECURITY_MONITORING_TRUSTED_EMAILS: z.string().optional(),

    TIKTOK_POSTING_CLIENT_KEY: z.string().optional(),
    TIKTOK_POSTING_CLIENT_SECRET: z.string().optional(),
    TIKTOK_POSTING_REDIRECT_URI: z.string().optional(),
    TIKTOK_POSTING_SCOPES: z.string().optional(),

    TIKTOK_BUSINESS_CLIENT_KEY: z.string().optional(),
    TIKTOK_BUSINESS_CLIENT_SECRET: z.string().optional(),
    TIKTOK_BUSINESS_REDIRECT_URI: z.string().optional(),
    TIKTOK_BUSINESS_SCOPES: z.string().optional(),
    TIKTOK_BUSINESS_AUTH_URL: z.string().optional(),

    /** Mac 抓取 Creative Center 后推送到服务器的共享密钥（请求头 x-tiktok-trends-import-secret） */
    TIKTOK_TRENDS_IMPORT_SECRET: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().min(8).optional()
    ),

    /** 企业支付宝「收款码」图片 URL（HTTPS 可公网访问），用于个人中心展示；未设置则隐藏扫码入口 */
    ALIPAY_ENTERPRISE_QR_IMAGE_URL: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().url().optional()
    ),

    /** 支付宝开放平台：当面付预下单 + 异步通知自动开通邮件套餐。沙箱 gateway 默认 openapi.alipaydev.com */
    ALIPAY_APP_ID: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().optional()),
    ALIPAY_PRIVATE_KEY: z.preprocess((v) => {
      if (typeof v !== "string" || v.trim() === "") return undefined;
      return normalizeAlipayKeyEnvString(v)
        .replace(/\\n/g, "\n")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");
    }, z.string().optional()),
    ALIPAY_PUBLIC_KEY: z.preprocess((v) => {
      if (typeof v !== "string" || v.trim() === "") return undefined;
      return normalizeAlipayKeyEnvString(v)
        .replace(/\\n/g, "\n")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");
    }, z.string().optional()),
    /** 可选：应用私钥 PEM 文件路径（绝对路径或相对 backend 根）。与 ALIPAY_PRIVATE_KEY 二选一即可；若两者皆有，以内联 ALIPAY_PRIVATE_KEY 为准。 */
    ALIPAY_PRIVATE_KEY_FILE: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().optional()
    ),
    /** 可选：支付宝公钥 PEM 文件路径。与 ALIPAY_PUBLIC_KEY 二选一；若两者皆有，以内联为准。 */
    ALIPAY_PUBLIC_KEY_FILE: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().optional()
    ),
    ALIPAY_GATEWAY: z.preprocess((v) => {
      if (typeof v !== "string") return undefined;
      const t = v.replace(/^\uFEFF/, "").replace(/\u200b/g, "").trim();
      if (t === "") return undefined;
      return t;
    }, z.string().url().optional()),
    /**
     * 可选：1 USD = 多少 CNY。设置后邮件套餐支付宝订单不再请求外部汇率接口（适合内网或接口不可达）。
     * 未设置时使用 Frankfurter 日频汇率并短时缓存。
     */
    ALIPAY_USD_CNY_RATE: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.coerce.number().positive().optional()
    ),
    /** 完整异步通知 URL（优先）。不填则用 PUBLIC_BASE_URL + /api/alipay/callback（当面付 notify_url） */
    ALIPAY_NOTIFY_URL: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().url().optional()
    ),
    /** 支付完成跳转页（优先）。不填则用 PUBLIC_BASE_URL + /account/center?alipay=return */
    ALIPAY_RETURN_URL: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().url().optional()
    ),
    /**
     * 开发联调：为 true 时开放 POST …/alipay-dev-simulate-activate，跳过真实支付宝直接开通邮件套餐。
     * 未设置时：非 production 默认 true（先跑通全自动再补沙箱）；生产环境默认 false。显式设为 false 可关闭。
     */
    ALIPAY_DEV_SIMULATE_PAY: z.preprocess((v) => {
      if (v === "false" || v === "0" || v === "no") return false;
      if (v === "true" || v === "1" || v === "yes") return true;
      if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) {
        return process.env.NODE_ENV === "production" ? false : true;
      }
      return false;
    }, z.boolean()),

    /** 空中云汇（Airwallex）香港商户：独立部署购物车 USD 收款（Hosted Payment Page） */
    AIRWALLEX_CLIENT_ID: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().optional()
    ),
    AIRWALLEX_API_KEY: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().optional()
    ),
    /** Webhook 验签密钥（Airwallex 控制台 → Developers → Webhooks） */
    AIRWALLEX_WEBHOOK_SECRET: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().optional()
    ),
    /** demo（沙箱）或 prod（生产）；缺省 demo */
    AIRWALLEX_ENV: z.preprocess((v) => {
      if (typeof v !== "string" || v.trim() === "") return undefined;
      return v.trim().toLowerCase();
    }, z.string().optional()),
    /** 可选：自定义 API 根（一般不需填，按 AIRWALLEX_ENV 自动选 demo/prod 域名） */
    AIRWALLEX_API_BASE: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().url().optional()
    ),
    /** 支付完成回跳（优先）。不填则用 PUBLIC_BASE_URL + /standalone-deploy/plans */
    AIRWALLEX_RETURN_URL: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().url().optional()
    ),

    /** 接收租户服务器信息 / IP 加购等通知；环境变量留空时默认 2415022172@qq.com */
    ADMIN_ALERT_EMAIL: z.preprocess((v) => {
      if (v === undefined || v === null) return "2415022172@qq.com";
      if (typeof v === "string" && v.trim() === "") return "2415022172@qq.com";
      return v;
    }, z.string().email()),
    /** 通知邮件 SMTP；不配置时仅写入 admin_tenant_notifications + 控制台日志 */
    ALERT_SMTP_HOST: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().optional()
    ),
    ALERT_SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
    ALERT_SMTP_SECURE: z.coerce.boolean().optional(),
    ALERT_SMTP_USER: z.string().optional(),
    ALERT_SMTP_PASS: z.string().optional(),
    ALERT_SMTP_FROM: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().email().optional()
    ),

    /**
     * 注册页邮箱验证码：走 SMTP（腾讯云邮件推送等）。
     * 地域 SMTP 主机见 https://cloud.tencent.com/document/product/1288/65750
     */
    AUTH_EMAIL_SMTP_HOST: z.preprocess((v) => {
      if (typeof v !== "string" || v.trim() === "") return undefined;
      const n = normalizeAlipayKeyEnvString(v);
      return n.trim() === "" ? undefined : n.trim();
    }, z.string().optional()),
    AUTH_EMAIL_SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(465),
    AUTH_EMAIL_SMTP_SECURE: z.preprocess((v) => {
      if (v === "false" || v === "0" || v === "no") return false;
      if (v === "true" || v === "1" || v === "yes") return true;
      if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) return true;
      return Boolean(v);
    }, z.boolean()),
    AUTH_EMAIL_SMTP_USER: z.preprocess((v) => {
      if (typeof v !== "string" || v.trim() === "") return undefined;
      const n = normalizeAlipayKeyEnvString(v);
      return n.trim() === "" ? undefined : n.trim();
    }, z.string().optional()),
    AUTH_EMAIL_SMTP_PASS: z.preprocess((v) => {
      if (typeof v !== "string" || v.trim() === "") return undefined;
      const n = normalizeAlipayKeyEnvString(v);
      return n.trim() === "" ? undefined : n.trim();
    }, z.string().optional()),
    /** 发件人地址；不填则默认 noreply@example.com */
    AUTH_EMAIL_FROM: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().email().optional()
    ),

    /**
     * 注册/重置验证码发信：
     * - smtp：nodemailer + AUTH_EMAIL_SMTP_*（默认）
     * - tencent_template：腾讯云 SendEmail 模板 API
     * - aoksend：AokSend 模板 API v2（须 AOKSEND_APP_KEY + AOKSEND_TEMPLATE_ID；设 AUTH_EMAIL_OTP_CHANNEL=aoksend 时发码走 AokSend，可不必配置 SMTP）
     */
    AUTH_EMAIL_OTP_CHANNEL: z.preprocess((v) => {
      const s = typeof v === "string" ? v.trim().toLowerCase() : "";
      if (s === "tencent_template") return "tencent_template";
      if (s === "aoksend") return "aoksend";
      return "smtp";
    }, z.enum(["smtp", "tencent_template", "aoksend"])),
    /** 腾讯云 API 3.0 SecretId（须具备邮件推送 SendEmail 权限）；仅 tencent_template 模式需要 */
    TENCENT_SES_SECRET_ID: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().optional()
    ),
    TENCENT_SES_SECRET_KEY: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().optional()
    ),
    /** SendEmail Region，须为控制台支持的地域，如 ap-hongkong、ap-guangzhou */
    TENCENT_SES_REGION: z.preprocess((v) => {
      if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) return "ap-hongkong";
      return String(v).trim();
    }, z.string().min(1)),
    /** 控制台「发信模板」数字 ID，例如注册验证码模板 173434 */
    AUTH_EMAIL_OTP_TEMPLATE_ID: z.preprocess((v) => {
      if (v === undefined || v === null) return undefined;
      const s = String(v).trim();
      if (!s) return undefined;
      const n = Number(s);
      return Number.isFinite(n) && n > 0 ? n : undefined;
    }, z.number().int().positive().optional()),
    /**
     * 模板中验证码占位符的 JSON 键名，须与控制台模板变量一致；缺省为 code（TemplateData 形如 {"code":"123456"}）。
     */
    AUTH_EMAIL_OTP_TEMPLATE_CODE_PARAM: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().min(1).max(64).optional()
    ),
    /** 可选：合并进 TemplateData 的静态 JSON 对象，如 {"minutes":"10"} */
    AUTH_EMAIL_OTP_TEMPLATE_EXTRA_JSON: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().optional()
    ),

    /** AokSend API 密钥（控制台「API配置」）；仅 AUTH_EMAIL_OTP_CHANNEL=aoksend 时需要 */
    AOKSEND_APP_KEY: z.preprocess((v) => {
      if (typeof v !== "string" || v.trim() === "") return undefined;
      const n = normalizeAlipayKeyEnvString(v);
      return n.trim() === "" ? undefined : n.trim();
    }, z.string().optional()),
    /** AokSend 模板调用 ID，如 E_145795054938（下划线；须与当前 app_key 同属一账号） */
    AOKSEND_TEMPLATE_ID: z.preprocess((v) => {
      if (typeof v !== "string" || v.trim() === "") return undefined;
      const n = normalizeAlipayKeyEnvString(v);
      return n.trim() === "" ? undefined : n.trim();
    }, z.string().min(1).max(80).optional()),
    /** 注册验证码专用模板（可选）；未设时注册与重置均用 AOKSEND_TEMPLATE_ID */
    AOKSEND_REGISTER_TEMPLATE_ID: z.preprocess((v) => {
      if (typeof v !== "string" || v.trim() === "") return undefined;
      const n = normalizeAlipayKeyEnvString(v);
      return n.trim() === "" ? undefined : n.trim();
    }, z.string().min(1).max(80).optional()),
    /** 重置密码验证码专用模板（可选）；未设时用 AOKSEND_TEMPLATE_ID */
    AOKSEND_RESET_TEMPLATE_ID: z.preprocess((v) => {
      if (typeof v !== "string" || v.trim() === "") return undefined;
      const n = normalizeAlipayKeyEnvString(v);
      return n.trim() === "" ? undefined : n.trim();
    }, z.string().min(1).max(80).optional()),
    /** 默认 https://apiv2.aoksend.com/index/api/send_email；若控制台仅支持旧网关可试 https://www.aoksend.com/index/api/send_email */
    AOKSEND_API_URL: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().url().optional()
    ),
    /** 选填：发件人显示名（AokSend 参数 alias） */
    AOKSEND_ALIAS: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().max(120).optional()
    ),
    /**
     * AUTH_EMAIL_OTP_CHANNEL=aoksend 时：忘记密码在 AokSend 成功后，再用 AUTH_EMAIL_SMTP_* 补发一封（QQ 等邮箱投递更稳）。
     * 注册已关闭验证码时可只开此项，不必改回 smtp 通道。
     */
    AUTH_EMAIL_OTP_RESET_SMTP_SHADOW: z.preprocess((v) => {
      if (v === "false" || v === "0" || v === "no") return false;
      if (v === "true" || v === "1" || v === "yes") return true;
      return false;
    }, z.boolean()),
    /**
     * AUTH_EMAIL_OTP_CHANNEL=aoksend 时：忘记密码在 AokSend 成功后，再用腾讯云 SendEmail 模板 API 补发（须 TENCENT_SES_* + AUTH_EMAIL_OTP_TEMPLATE_ID）。
     */
    AUTH_EMAIL_OTP_RESET_TENCENT_SHADOW: z.preprocess((v) => {
      if (v === "false" || v === "0" || v === "no") return false;
      if (v === "true" || v === "1" || v === "yes") return true;
      return false;
    }, z.boolean()),

    /** 自动抓取退信邮箱（DSN/NDR）配置；全部配置后才会启动 IMAP 轮询 */
    BOUNCE_IMAP_HOST: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().optional()
    ),
    BOUNCE_IMAP_PORT: z.coerce.number().int().min(1).max(65535).default(993),
    BOUNCE_IMAP_SECURE: z.preprocess((v) => {
      if (v === "false" || v === "0" || v === "no") return false;
      if (v === "true" || v === "1" || v === "yes") return true;
      if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) return true;
      return Boolean(v);
    }, z.boolean()),
    BOUNCE_IMAP_USER: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().optional()
    ),
    BOUNCE_IMAP_PASS: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().optional()
    ),
    BOUNCE_IMAP_MAILBOX: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().default("INBOX")
    ),
    BOUNCE_IMAP_POLL_SECONDS: z.coerce.number().int().min(15).max(3600).default(90),
    BOUNCE_IMAP_MARK_SEEN: z.preprocess((v) => {
      if (v === "false" || v === "0" || v === "no") return false;
      if (v === "true" || v === "1" || v === "yes") return true;
      if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) return true;
      return Boolean(v);
    }, z.boolean()),
    /** 可选：env 退信源默认租户；不填则 0（全租户匹配，推荐） */
    BOUNCE_IMAP_TENANT_ID: z.coerce.number().int().nonnegative().optional(),

    /**
     * 对外站点根 URL（无尾斜杠），用于「图片转 URL」等接口返回绝对地址。
     * 生产环境建议设为 https://你的域名 ，以便复制到 .env 等场景即为公网 HTTPS。
     */
    PUBLIC_BASE_URL: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().url().optional()
    ),

    /**
     * 腾讯云邮件推送控制台「回调地址」共享密钥（可选）。
     * 配置后，POST /api/email/webhooks/tencent-ses 须在 URL ?secret= 或请求头 x-bss-tencent-callback-secret 携带相同值。
     */
    TENCENT_SES_CALLBACK_SECRET: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().optional()
    ),

    /**
     * AWS SES BYOD 模式总开关。
     *   false / 缺省：SES 服务运行在 "mock" 模式，所有 SES API 调用都返回伪数据
     *                （DKIM token 是确定性 hash，验证状态可手动模拟），不连真 AWS。
     *                这样前端 / 后端可以独立开发 + 测试，不需要 AWS 账号。
     *   true：真正调用 @aws-sdk/client-sesv2，需要配齐下面的 AWS_* 凭证。
     */
    AWS_SES_ENABLED: z.preprocess((v) => {
      if (v === "false" || v === "0" || v === "no") return false;
      if (v === "true" || v === "1" || v === "yes") return true;
      return false;
    }, z.boolean()),
    AWS_REGION: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().default("us-east-1")
    ),
    AWS_ACCESS_KEY_ID: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().optional()
    ),
    AWS_SECRET_ACCESS_KEY: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().optional()
    ),
    /** SES Configuration Set 名（推荐每个环境一个，便于按 set 看 reputation） */
    AWS_SES_CONFIGURATION_SET: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().optional()
    ),
    /** SES bounce/complaint SNS Topic ARN，可选；订阅 SNS HTTP 回调到本服务的 webhook */
    AWS_SES_BOUNCE_SNS_TOPIC: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().optional()
    ),
    /** SNS HTTP webhook 共享密钥，进站校验，避免任何 SNS 端点被滥用 */
    AWS_SES_BOUNCE_WEBHOOK_SECRET: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().optional()
    ),
    /** 在 mock 模式下，每隔 N 秒模拟一次 DKIM 验证通过；缺省 30s（生产真 SES 时此值无效） */
    AWS_SES_MOCK_AUTO_VERIFY_SECONDS: z.coerce.number().int().min(0).max(86400).default(30),

    /**
     * R20：专线 provision 走异步 Job + 后台轮询。默认 false（仍同步 POST provision-server-group）。
     * R21 SSH 自动化依赖本开关与 Job 表。
     */
    EMAIL_DEDICATED_PROVISION_JOBS_ENABLED: z.preprocess((v) => {
      if (v === "true" || v === "1" || v === "yes") return true;
      return false;
    }, z.boolean()),

    /**
     * R21：provision 前 SSH 至 Relay 生成 DKIM、配置 SASL；至 Mail 机配置 Dovecot 用户。
     * 需工作组级 relay_vps_password_enc；默认 false。
     */
    EMAIL_DEDICATED_PROVISION_SSH_ENABLED: z.preprocess((v) => {
      if (v === "true" || v === "1" || v === "yes") return true;
      return false;
    }, z.boolean()),
    /** Relay/Mail 上 mail-vps 脚本目录（须已 scp 或随 deploy 同步） */
    EMAIL_DEDICATED_MAIL_VPS_SCRIPTS_DIR: z
      .string()
      .default("/var/www/BigSocialBoss/deploy/mail-vps"),
    EMAIL_DEDICATED_SSH_PORT: z.coerce.number().int().min(1).max(65535).default(22),
    EMAIL_DEDICATED_SSH_TIMEOUT_MS: z.coerce.number().int().min(5000).max(300_000).default(90_000),

    /**
     * R23：管理端从业务机 SSH 至空白 Relay/Mail，同步 mail-vps 并执行 install-*.sh。
     * 需 EMAIL_DEDICATED_PROVISION_SSH_ENABLED 同级凭据（机组 VPS 密码）。默认 false。
     */
    EMAIL_DEDICATED_VPS_INSTALL_ENABLED: z.preprocess((v) => {
      if (v === "true" || v === "1" || v === "yes") return true;
      return false;
    }, z.boolean()),
    /** 目标 VPS 上脚本目录（SCP 后执行） */
    EMAIL_DEDICATED_VPS_REMOTE_SCRIPTS_DIR: z.string().default("/root/mail-vps"),
    /** 整机 apt 装机 SSH 超时（毫秒） */
    EMAIL_DEDICATED_VPS_INSTALL_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(60_000)
      .max(900_000)
      .default(600_000),

    /** 独立部署安装包 tar.gz（amd64，兼容旧配置；见 build-install-pack.sh） */
    STANDALONE_INSTALL_PACK_PATH: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().optional()
    ),
    STANDALONE_INSTALL_PACK_PATH_AMD64: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().optional()
    ),
    STANDALONE_INSTALL_PACK_PATH_ARM64: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().optional()
    ),

    /** 授权安装：SSH 远程自动部署（需 STANDALONE_INSTALL_PACK_PATH 指向有效 tar.gz） */
    STANDALONE_DEPLOY_REMOTE_INSTALL_ENABLED: z.preprocess((v) => {
      if (v === "false" || v === "0" || v === "no") return false;
      return true;
    }, z.boolean()),
    STANDALONE_DEPLOY_INSTALL_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(120_000)
      .max(1_800_000)
      .default(900_000),

    /** 开源版档位（替代商业 LICENSE 体系） */
    OPEN_CORE_PLAN_TIER_ID: z.string().default("email-send-3000"),
    /** 开源版日发上限 */
    OPEN_CORE_DAILY_SEND_LIMIT: z.coerce.number().int().min(1).default(3000),

    /** 企业邮箱地址（逗号分隔，默认空） */
    DAILY_MAILBOX_ADDRESSES: z.string().default(""),
    /** 员工邮箱地址（逗号分隔，默认空） */
    STAFF_MAILBOX_ADDRESSES: z.string().default(""),
    /** 员工邮箱名称映射 JSON，默认空 */
    STAFF_MAILBOX_META_JSON: z.string().default(""),
    /** 邮箱槽位域名（逗号分隔，默认空） */
    MAILBOX_SLOT_DOMAINS: z.string().default("")
  })
  .parse(process.env);

export type Env = typeof env;
