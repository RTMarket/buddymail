/**
 * 营销活动邮件预设：4 种布局 × 中文 / 英文 = 8 套。
 * HTML 以内联样式为主，避免复杂表格以便 Quill 编辑。
 */

export type EmailStarterPreset = {
  id: string;
  locale: "zh" | "en";
  /** 卡片标题 */
  label: string;
  blurb: string;
  subjectHint: string;
  bodyHtml: string;
};

const FOOTER_ZH =
  '<p style="font-size:11px;color:#94a3b8;text-align:center;line-height:1.5;margin-top:24px;">' +
  "提示：正式群发时，系统会在邮件末尾<strong>自动附加</strong>每位收件人专属的<strong>订阅</strong>、<strong>退订</strong>与<strong>投诉</strong>链接，无需在此处手写。</p>";

const FOOTER_EN =
  '<p style="font-size:11px;color:#94a3b8;text-align:center;line-height:1.5;margin-top:24px;">' +
  "Note: When sending campaigns, the system will automatically append personalized <strong>unsubscribe</strong> and <strong>complaint</strong> links at the end—you don't need to add them manually.</p>";

/** 全部 8 套（展示顺序：中文 4 → 英文 4） */
export const EMAIL_STARTER_PRESETS: EmailStarterPreset[] = [
  // —— 中文 · 极简着陆 ——
  {
    id: "minimal-cta-zh",
    locale: "zh",
    label: "极简着陆",
    blurb: "Logo、短文、双按钮，适合通知与功能推介。",
    subjectHint: "{{name}}，我们想与您分享一项更新",
    bodyHtml: `
<p style="text-align:center;margin:0 0 8px;"><img src="https://placehold.co/140x48/f1f5f9/475569?text=LOGO" alt="Logo" width="140" height="48" style="display:inline-block;border:0;" /></p>
<p style="text-align:center;margin:12px 0 8px;"><span style="font-size:15px;color:#334155;line-height:1.65;">大多数应用都需要可靠的身份验证。我们的产品帮助你更快上线——成本可控，并可与现有流程衔接。</span></p>
<p style="text-align:center;margin:8px 0;"><span style="font-size:15px;color:#334155;line-height:1.65;">几分钟即可完成对接：支持邮箱登录、魔法链接或验证码；后续可按需扩展更多方式。</span></p>
<p style="text-align:center;margin:8px 0 20px;"><span style="font-size:15px;color:#334155;line-height:1.65;">接口已就绪——随时可用。</span></p>
<p style="text-align:center;margin:16px 0 8px;"><a href="https://example.com/docs" style="display:inline-block;padding:12px 28px;background:#059669;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">查看文档</a></p>
<p style="text-align:center;margin:8px 0 24px;"><a href="https://example.com/start" style="display:inline-block;padding:12px 28px;background:#059669;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">快速开始</a></p>
<p style="text-align:center;margin:0 0 8px;"><span style="font-size:13px;color:#64748b;">关注我们（替换为你的链接）：</span></p>
<p style="text-align:center;margin:0;"><span style="font-size:13px;color:#64748b;">官网 · 社交媒体 · 社群</span></p>
${FOOTER_ZH}
`.trim()
  },
  {
    id: "minimal-cta-en",
    locale: "en",
    label: "Minimal landing",
    blurb: "Logo, short copy, dual CTAs—great for announcements.",
    subjectHint: "{{name}}, Here's a quick update we think you'll like",
    bodyHtml: `
<p style="text-align:center;margin:0 0 8px;"><img src="https://placehold.co/140x48/f1f5f9/475569?text=LOGO" alt="Logo" width="140" height="48" style="display:inline-block;border:0;" /></p>
<p style="text-align:center;margin:12px 0 8px;"><span style="font-size:15px;color:#334155;line-height:1.65;">Most apps need dependable authentication. Our product helps you ship faster—cost-effective and easy to integrate with your existing workflows.</span></p>
<p style="text-align:center;margin:8px 0;"><span style="font-size:15px;color:#334155;line-height:1.65;">Go live in minutes with email login, magic links, or one-time codes—add more methods whenever you're ready.</span></p>
<p style="text-align:center;margin:8px 0 20px;"><span style="font-size:15px;color:#334155;line-height:1.65;">It's ready in your project whenever you are.</span></p>
<p style="text-align:center;margin:16px 0 8px;"><a href="https://example.com/docs" style="display:inline-block;padding:12px 28px;background:#059669;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">Read the docs</a></p>
<p style="text-align:center;margin:8px 0 24px;"><a href="https://example.com/start" style="display:inline-block;padding:12px 28px;background:#059669;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">Try the quickstart</a></p>
<p style="text-align:center;margin:0 0 8px;"><span style="font-size:13px;color:#64748b;">Follow us (replace with your links):</span></p>
<p style="text-align:center;margin:0;"><span style="font-size:13px;color:#64748b;">Website · Social · Community</span></p>
${FOOTER_EN}
`.trim()
  },

  // —— 中文 · 权益清单 ——
  {
    id: "newsletter-benefits-zh",
    locale: "zh",
    label: "权益清单",
    blurb: "问候、列表、主按钮，适合会员与促销说明。",
    subjectHint: "{{name}}，欢迎了解您的专属权益",
    bodyHtml: `
<p style="margin:0 0 12px;font-size:16px;color:#0f172a;"><strong>您好 {{name}}，</strong></p>
<p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.65;">感谢您一直以来的关注。以下为本次为您整理的核心权益概览——请按需改写。</p>
<p style="margin:0 0 8px;font-size:15px;color:#0f172a;"><strong>您的权益包含：</strong></p>
<ul style="margin:0 0 20px;padding-left:20px;color:#334155;line-height:1.65;font-size:15px;">
<li>专属客户经理 / 响应时效说明</li>
<li>模板或额度类权益（替换为真实条款）</li>
<li>培训资料或社群入口</li>
<li>试用期或退款政策摘要（务必合规）</li>
<li>更多条款见附件或官网</li>
</ul>
<p style="text-align:center;margin:8px 0 24px;"><a href="https://example.com/join" style="display:inline-block;padding:14px 32px;background:#ea580c;color:#ffffff;text-decoration:none;border-radius:999px;font-size:15px;font-weight:700;">立即了解详情</a></p>
<p style="margin:0;font-size:13px;color:#64748b;line-height:1.55;">可在下方插入合作品牌 Logo（工具栏插图替换占位图）。</p>
<p style="text-align:center;margin:12px 0 0;"><img src="https://placehold.co/520x80/f8fafc/64748b?text=Partner+logos" alt="Partners" width="520" height="80" style="max-width:100%;height:auto;border:0;" /></p>
${FOOTER_ZH}
`.trim()
  },
  {
    id: "newsletter-benefits-en",
    locale: "en",
    label: "Benefits list",
    blurb: "Greeting, bullets, hero CTA—great for memberships & promos.",
    subjectHint: "{{name}}, Here's what's included in your membership",
    bodyHtml: `
<p style="margin:0 0 12px;font-size:16px;color:#0f172a;"><strong>Hi {{name}},</strong></p>
<p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.65;">Thanks for being with us. Here's a quick overview of what's included—edit freely to match your offer.</p>
<p style="margin:0 0 8px;font-size:15px;color:#0f172a;"><strong>Your membership includes:</strong></p>
<ul style="margin:0 0 20px;padding-left:20px;color:#334155;line-height:1.65;font-size:15px;">
<li>Dedicated support / SLA summary</li>
<li>Credits or template allowances (replace with real terms)</li>
<li>Training resources or community access</li>
<li>Trial/refund policy summary (must be compliant)</li>
<li>More details in the attachment or on your website</li>
</ul>
<p style="text-align:center;margin:8px 0 24px;"><a href="https://example.com/join" style="display:inline-block;padding:14px 32px;background:#ea580c;color:#ffffff;text-decoration:none;border-radius:999px;font-size:15px;font-weight:700;">See the details</a></p>
<p style="margin:0;font-size:13px;color:#64748b;line-height:1.55;">Add partner logos below (replace the placeholder image).</p>
<p style="text-align:center;margin:12px 0 0;"><img src="https://placehold.co/520x80/f8fafc/64748b?text=Partner+logos" alt="Partners" width="520" height="80" style="max-width:100%;height:auto;border:0;" /></p>
${FOOTER_EN}
`.trim()
  },

  // —— 中文 · 分区画册 ——
  {
    id: "hero-cards-zh",
    locale: "zh",
    label: "分区画册",
    blurb: "主图、分区卖点、资源卡片，适合活动推广。",
    subjectHint: "{{name}}，助力您更快上手的一份资源清单",
    bodyHtml: `
<p style="text-align:center;margin:0 0 12px;"><img src="https://placehold.co/640x280/fdf2f8/be185d?text=Hero" alt="主视觉" width="640" height="280" style="max-width:100%;height:auto;border-radius:12px;border:0;" /></p>
<p style="text-align:center;margin:0 0 8px;"><a href="https://example.com/signup" style="display:inline-block;padding:12px 28px;background:#db2777;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">立即注册体验</a></p>
<p style="text-align:center;margin:0 0 20px;font-size:12px;color:#64748b;">副标题：例如每周答疑或学院课程——请改成你的文案。</p>
<h3 style="margin:24px 0 12px;font-size:17px;color:#0f172a;text-align:center;">与伙伴一起成长</h3>
<p style="margin:0 0 8px;font-size:15px;color:#334155;line-height:1.65;"><strong>方案 A · 标题</strong><br/>简短描述一行或两行。</p>
<p style="margin:0 0 16px;text-align:center;"><a href="https://example.com/a" style="display:inline-block;padding:10px 22px;background:#db2777;color:#fff;text-decoration:none;border-radius:8px;font-size:13px;">了解方案 A</a></p>
<p style="margin:0 0 8px;font-size:15px;color:#334155;line-height:1.65;"><strong>方案 B · 标题</strong><br/>简短描述一行或两行。</p>
<p style="margin:0 0 24px;text-align:center;"><a href="https://example.com/b" style="display:inline-block;padding:10px 22px;background:#db2777;color:#fff;text-decoration:none;border-radius:8px;font-size:13px;">了解方案 B</a></p>
<h3 style="margin:0 0 12px;font-size:17px;color:#0f172a;">需要帮助入门？</h3>
<p style="margin:0 0 8px;padding:14px 16px;background:#fdf2f8;border-radius:10px;font-size:14px;color:#831843;line-height:1.55;"><strong>入门指南</strong> — 替换为你的教程摘要。</p>
<p style="margin:12px 0 8px;padding:14px 16px;background:#fdf2f8;border-radius:10px;font-size:14px;color:#831843;line-height:1.55;"><strong>下载资料</strong> — 替换为你的工具或手册说明。</p>
<p style="margin:12px 0 0;padding:14px 16px;background:#fdf2f8;border-radius:10px;font-size:14px;color:#831843;line-height:1.55;"><strong>加入社群</strong> — 替换为你的社群邀请文案。</p>
<p style="margin:24px 0 0;font-size:15px;color:#334155;">祝商祺，<br/><strong>你的团队名称</strong></p>
${FOOTER_ZH}
`.trim()
  },
  {
    id: "hero-cards-en",
    locale: "en",
    label: "Hero & sections",
    blurb: "Hero image, stacked sections, resource cards—great for campaigns.",
    subjectHint: "{{name}}, Resources to help you move faster",
    bodyHtml: `
<p style="text-align:center;margin:0 0 12px;"><img src="https://placehold.co/640x280/fdf2f8/be185d?text=Hero" alt="Hero" width="640" height="280" style="max-width:100%;height:auto;border-radius:12px;border:0;" /></p>
<p style="text-align:center;margin:0 0 8px;"><a href="https://example.com/signup" style="display:inline-block;padding:12px 28px;background:#db2777;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">Sign up</a></p>
<p style="text-align:center;margin:0 0 20px;font-size:12px;color:#64748b;">Subtitle: weekly sessions, academy tips—replace with your copy.</p>
<h3 style="margin:24px 0 12px;font-size:17px;color:#0f172a;text-align:center;">Grow with partners</h3>
<p style="margin:0 0 8px;font-size:15px;color:#334155;line-height:1.65;"><strong>Option A · Title</strong><br/>One or two lines of supporting text.</p>
<p style="margin:0 0 16px;text-align:center;"><a href="https://example.com/a" style="display:inline-block;padding:10px 22px;background:#db2777;color:#fff;text-decoration:none;border-radius:8px;font-size:13px;">Learn more</a></p>
<p style="margin:0 0 8px;font-size:15px;color:#334155;line-height:1.65;"><strong>Option B · Title</strong><br/>One or two lines of supporting text.</p>
<p style="margin:0 0 24px;text-align:center;"><a href="https://example.com/b" style="display:inline-block;padding:10px 22px;background:#db2777;color:#fff;text-decoration:none;border-radius:8px;font-size:13px;">Learn more</a></p>
<h3 style="margin:0 0 12px;font-size:17px;color:#0f172a;">Need help getting started?</h3>
<p style="margin:0 0 8px;padding:14px 16px;background:#fdf2f8;border-radius:10px;font-size:14px;color:#831843;line-height:1.55;"><strong>Getting started guide</strong> — replace with your tutorial summary.</p>
<p style="margin:12px 0 8px;padding:14px 16px;background:#fdf2f8;border-radius:10px;font-size:14px;color:#831843;line-height:1.55;"><strong>Download</strong> — replace with your toolkit or PDF.</p>
<p style="margin:12px 0 0;padding:14px 16px;background:#fdf2f8;border-radius:10px;font-size:14px;color:#831843;line-height:1.55;"><strong>Community</strong> — replace with your invite copy.</p>
<p style="margin:24px 0 0;font-size:15px;color:#334155;">Best regards,<br/><strong>Your team name</strong></p>
${FOOTER_EN}
`.trim()
  },

  // —— 中文 · 品牌条促销 ——
  {
    id: "brand-bar-zh",
    locale: "zh",
    label: "品牌条促销",
    blurb: "深色顶栏、报价区、底栏联系，适合电商促销。",
    subjectHint: "{{name}}，限时优惠 · 详情如下",
    bodyHtml: `
<p style="margin:0;padding:18px 16px;background:#0f172a;color:#ffffff;text-align:center;font-size:18px;font-weight:700;border-radius:12px 12px 0 0;">你的品牌名 · 一句话 Slogan</p>
<p style="margin:0;padding:12px 16px;background:#0f172a;color:#cbd5e1;text-align:center;font-size:13px;border-radius:0 0 12px 12px;">副标题：例如全国配送 / 正品保障。</p>
<p style="margin:20px 0 12px;font-size:15px;color:#334155;"><strong>尊敬的 {{name}}，</strong></p>
<p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.65;">活动引言：突出限时、库存或渠道专属优惠（请勿夸大宣传）。</p>
<p style="margin:0 0 8px;font-size:15px;color:#0f172a;"><strong>选项一 · 产品名称</strong> <span style="color:#059669;">¥000</span> <span style="font-size:13px;color:#64748b;">（含税说明请自填）</span></p>
<p style="margin:0 0 16px;"><a href="https://example.com/order1" style="color:#059669;font-weight:600;">前往下单 →</a></p>
<p style="margin:0 0 8px;font-size:15px;color:#0f172a;"><strong>选项二 · 产品名称</strong> <span style="color:#059669;">¥000</span></p>
<p style="margin:0 0 16px;"><a href="https://example.com/order2" style="color:#059669;font-weight:600;">前往下单 →</a></p>
<p style="text-align:center;margin:16px 0;"><img src="https://placehold.co/560x200/f8fafc/475569?text=Product" alt="产品" width="560" height="200" style="max-width:100%;height:auto;border-radius:10px;border:1px solid #e2e8f0;" /></p>
<ul style="margin:16px 0;padding-left:20px;color:#334155;line-height:1.65;font-size:15px;">
<li>✅ 履约或质保条款摘要</li>
<li>✅ 发货时效或售后说明</li>
</ul>
<p style="margin:20px 0;font-size:15px;color:#334155;">顺祝商祺，<br/><strong>你的团队名称</strong></p>
<p style="margin:0;padding:18px 16px;background:#0f172a;color:#cbd5e1;font-size:12px;line-height:1.6;border-radius:12px;">
<strong style="color:#fff;">公司名称</strong><br/>
地址 · 电话 · <a href="mailto:support@example.com" style="color:#93c5fd;">support@example.com</a><br/>
<span style="color:#94a3b8;">退订链接由系统在发送时统一追加。</span>
</p>
${FOOTER_ZH}
`.trim()
  },
  {
    id: "brand-bar-en",
    locale: "en",
    label: "Brand bar promo",
    blurb: "Dark header/footer, offers block—great for commerce.",
    subjectHint: "{{name}}, Limited-time offer — details inside",
    bodyHtml: `
<p style="margin:0;padding:18px 16px;background:#0f172a;color:#ffffff;text-align:center;font-size:18px;font-weight:700;border-radius:12px 12px 0 0;">Your brand · One-line slogan</p>
<p style="margin:0;padding:12px 16px;background:#0f172a;color:#cbd5e1;text-align:center;font-size:13px;border-radius:0 0 12px 12px;">Subtitle: nationwide shipping / authenticity—your proof points.</p>
<p style="margin:20px 0 12px;font-size:15px;color:#334155;"><strong>Dear {{name}},</strong></p>
<p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.65;">Introduce the promotion: availability, timing, and eligibility—avoid exaggerated claims.</p>
<p style="margin:0 0 8px;font-size:15px;color:#0f172a;"><strong>Item A · Product name</strong> <span style="color:#059669;">$000</span> <span style="font-size:13px;color:#64748b;">(tax notes)</span></p>
<p style="margin:0 0 16px;"><a href="https://example.com/order1" style="color:#059669;font-weight:600;">Order now →</a></p>
<p style="margin:0 0 8px;font-size:15px;color:#0f172a;"><strong>Item B · Product name</strong> <span style="color:#059669;">$000</span></p>
<p style="margin:0 0 16px;"><a href="https://example.com/order2" style="color:#059669;font-weight:600;">Order now →</a></p>
<p style="text-align:center;margin:16px 0;"><img src="https://placehold.co/560x200/f8fafc/475569?text=Product" alt="Product" width="560" height="200" style="max-width:100%;height:auto;border-radius:10px;border:1px solid #e2e8f0;" /></p>
<ul style="margin:16px 0;padding-left:20px;color:#334155;line-height:1.65;font-size:15px;">
<li>✅ Warranty / fulfillment summary</li>
<li>✅ Shipping & returns summary</li>
</ul>
<p style="margin:20px 0;font-size:15px;color:#334155;">Best,<br/><strong>Your team name</strong></p>
<p style="margin:0;padding:18px 16px;background:#0f172a;color:#cbd5e1;font-size:12px;line-height:1.6;border-radius:12px;">
<strong style="color:#fff;">Company name</strong><br/>
Address · Phone · <a href="mailto:support@example.com" style="color:#93c5fd;">support@example.com</a><br/>
<span style="color:#94a3b8;">Unsubscribe links are appended automatically at send time.</span>
</p>
${FOOTER_EN}
`.trim()
  }
];

export const EMAIL_STARTER_PRESETS_ZH = EMAIL_STARTER_PRESETS.filter((p) => p.locale === "zh");
export const EMAIL_STARTER_PRESETS_EN = EMAIL_STARTER_PRESETS.filter((p) => p.locale === "en");
