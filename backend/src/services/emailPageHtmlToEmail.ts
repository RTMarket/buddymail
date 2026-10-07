import { resolveAbsoluteUrl, stripHtmlToText } from "./emailUrlFetchShared.js";

const BLOCKED_REGION =
  /<(?:script|style|iframe|noscript|nav|header|footer)[^>]*>[\s\S]*?<\/(?:script|style|iframe|noscript|nav|header|footer)>/gi;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function keepSafeInlineStyle(style: string): string {
  const parts = style
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((decl) =>
      /^(text-align|color|background-color|font-size|font-weight|line-height|margin|padding|display|width|max-width|border-radius)\s*:/i.test(
        decl
      )
    );
  return parts.length ? parts.join(";") : "";
}

function htmlTablesToParagraphs(html: string): string {
  return html
    .replace(/<table[\s\S]*?<\/table>/gi, (table) => {
      const cells = table.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) ?? [];
      const parts = cells
        .map((c) => c.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
        .filter(Boolean);
      return parts.map((t) => `<p>${escapeHtml(t)}</p>`).join("");
    })
    .replace(/<tr[^>]*>/gi, "")
    .replace(/<\/tr>/gi, "")
    .replace(/<t[dh][^>]*>/gi, "<p>")
    .replace(/<\/t[dh]>/gi, "</p>");
}

/** 去掉导航、页脚、Loading 转圈、SEO 噪音 */
function removePageChrome(html: string): string {
  let h = html;
  h = h.replace(/<div[^>]*id=["']spinner-area["'][\s\S]*?<\/div>/gi, "");
  h = h.replace(/<div[^>]*class=["'][^"']*menu-wrap[^"']*["'][\s\S]*?(?=<div[^>]*class=["'][^"']*top-header|<section[^>]*id=["']main-body)/gi, "");
  h = h.replace(/<footer[\s\S]*?<\/footer>/gi, "");
  h = h.replace(/Powered by\s*<a[^>]*WHMCS[\s\S]*?<\/p>/gi, "");
  h = h.replace(/<div[^>]*class=["'][^"']*modal[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/gi, "");
  return h;
}

/** 提取主内容区（表单 / main-body / primary-content），跳过整站导航 */
export function extractMainHtmlFragment(html: string): string {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  const topHeader =
    cleaned.match(
      /<div[^>]*class=["'][^"']*top-header[^"']*["'][\s\S]*?<div[^>]*class=["'][^"']*heading["'][^>]*>[\s\S]*?<\/div>[\s\S]*?<\/div>[\s\S]*?<\/div>[\s\S]*?<\/div>[\s\S]*?<\/div>/i
    )?.[0] ?? "";

  const candidates = [
    cleaned.match(/<form[^>]*class=["'][^"']*login-form[^"']*["'][\s\S]*?<\/form>/i)?.[0],
    cleaned.match(/<section[^>]*id=["']main-body["'][\s\S]*?<\/section>/i)?.[0],
    cleaned.match(/<main[\s\S]*?<\/main>/i)?.[0],
    cleaned.match(/<article[\s\S]*?<\/article>/i)?.[0],
    cleaned.match(/<div[^>]*class=["'][^"']*primary-content[^"']*["'][\s\S]*?<\/div>/i)?.[0]
  ].filter(Boolean) as string[];

  let fragment = candidates[0] ?? "";
  if (!fragment) {
    const body = cleaned.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? cleaned;
    fragment = removePageChrome(body);
  } else {
    fragment = removePageChrome(fragment);
  }

  if (topHeader && !fragment.includes("top-header")) {
    fragment = topHeader + fragment;
  }
  return fragment.trim();
}

function extractTagText(html: string, pattern: RegExp): string {
  const m = pattern.exec(html);
  if (!m?.[1]) return "";
  return stripHtmlToText(m[1], 500);
}

/** WHMCS / 常见登录页 → 居中卡片排版（无 input，仅文字+按钮样式） */
function buildLoginPageEmailHtml(fragment: string): string | null {
  if (!/login-form/i.test(fragment)) return null;

  const bannerTitle =
    extractTagText(fragment, /<div[^>]*class=["'][^"']*heading["'][^>]*>([\s\S]*?)<\/div>/i) || "Login";
  const cardTitle = extractTagText(fragment, /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i) || bannerTitle;
  const subtitle = extractTagText(
    fragment,
    /<p[^>]*class=["'][^"']*text-muted[^"']*["'][^>]*>([\s\S]*?)<\/p>/i
  );
  const emailLabel = extractTagText(fragment, /<label[^>]*for=["']inputEmail["'][^>]*>([\s\S]*?)<\/label>/i) || "Email Address";
  const passwordLabel =
    extractTagText(fragment, /<label[^>]*for=["']inputPassword["'][^>]*>([\s\S]*?)<\/label>/i) || "Password";
  const forgotMatch = fragment.match(
    /<a[^>]*href=["'][^"']*password[^"']*["'][^>]*>([\s\S]*?)<\/a>/i
  );
  const forgotText = forgotMatch ? stripHtmlToText(forgotMatch[1]!, 80) : "";
  const forgotHref = forgotMatch ? forgotMatch[0].match(/href=["']([^"']+)["']/i)?.[1] ?? "" : "";
  const submitMatch = fragment.match(/<button[^>]*type=["']submit["'][^>]*>([\s\S]*?)<\/button>/i);
  const submitText = submitMatch ? stripHtmlToText(submitMatch[1]!, 40) : "Login";
  const remember = /remember\s*me/i.test(fragment) ? "Remember Me" : "";
  const footerSmall = extractTagText(fragment, /<div[^>]*class=["'][^"']*card-footer[^"']*["'][\s\S]*?<small>([\s\S]*?)<\/small>/i);
  const createAccountMatch = fragment.match(/<a[^>]*href=["'][^"']*register[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
  const createText = createAccountMatch ? stripHtmlToText(createAccountMatch[1]!, 60) : "";
  const createHref = createAccountMatch ? createAccountMatch[0].match(/href=["']([^"']+)["']/i)?.[1] ?? "" : "";

  const parts: string[] = [];
  parts.push(
    `<p style="margin:0;padding:22px 16px;text-align:center;background:#1a2744;color:#ffffff;font-size:22px;font-weight:600;line-height:1.3;">${escapeHtml(bannerTitle)}</p>`
  );
  parts.push(`<p style="margin:20px auto 0;max-width:540px;text-align:center;padding:0 16px;">`);
  parts.push(
    `<span style="display:block;font-size:20px;font-weight:600;color:#1e293b;">${escapeHtml(cardTitle)}</span>`
  );
  if (subtitle) {
    parts.push(
      `<span style="display:block;margin-top:6px;font-size:14px;color:#64748b;">${escapeHtml(subtitle)}</span>`
    );
  }
  parts.push(`</p>`);
  parts.push(
    `<p style="margin:20px auto 0;max-width:540px;padding:20px 24px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;text-align:left;">`
  );
  parts.push(
    `<span style="display:block;margin-bottom:6px;font-size:13px;font-weight:600;color:#334155;">${escapeHtml(emailLabel)}</span>`
  );
  parts.push(
    `<span style="display:block;margin-bottom:16px;font-size:13px;font-weight:600;color:#334155;">${escapeHtml(passwordLabel)}</span>`
  );
  if (forgotText && forgotHref) {
    parts.push(
      `<span style="display:block;margin-bottom:14px;font-size:12px;"><a href="${escapeHtml(forgotHref)}" style="color:#64748b;">${escapeHtml(forgotText)}</a></span>`
    );
  }
  parts.push(
    `<span style="display:inline-block;margin:8px 0;padding:10px 22px;background:#2563eb;color:#ffffff;font-size:14px;font-weight:600;border-radius:4px;">${escapeHtml(submitText)}</span>`
  );
  if (remember) {
    parts.push(
      `<span style="display:block;margin-top:14px;font-size:13px;color:#475569;">${escapeHtml(remember)}</span>`
    );
  }
  parts.push(`</p>`);
  if (footerSmall || createText) {
    parts.push(`<p style="margin:12px auto 0;max-width:540px;text-align:center;font-size:13px;color:#64748b;">`);
    if (footerSmall) parts.push(`${escapeHtml(footerSmall)} `);
    if (createText && createHref) {
      parts.push(`<a href="${escapeHtml(createHref)}" style="color:#2563eb;font-weight:600;">${escapeHtml(createText)}</a>`);
    }
    parts.push(`</p>`);
  }
  return parts.join("");
}

function stripFormControls(html: string): string {
  return html
    .replace(/<input[^>]*>/gi, "")
    .replace(/<textarea[\s\S]*?<\/textarea>/gi, "")
    .replace(/<select[\s\S]*?<\/select>/gi, "")
    .replace(/<button[^>]*type=["']submit["'][^>]*>([\s\S]*?)<\/button>/gi, (_m, inner) => {
      const t = stripHtmlToText(inner, 80);
      return t
        ? `<span style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;border-radius:4px;font-weight:600;">${escapeHtml(t)}</span>`
        : "";
    })
    .replace(/<button[\s\S]*?<\/button>/gi, "")
    .replace(/<form[^>]*>/gi, "<div>")
    .replace(/<\/form>/gi, "</div>");
}

export function sanitizeFragmentForQuill(raw: string, pageUrl: string): string {
  let h = removePageChrome(raw)
    .replace(BLOCKED_REGION, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  h = htmlTablesToParagraphs(h);
  h = stripFormControls(h);
  h = h.replace(/\s(class|id|data-[a-z0-9-]+)=["'][^"']*["']/gi, "");

  h = h.replace(/\sstyle=["']([^"']*)["']/gi, (_m, style: string) => {
    const safe = keepSafeInlineStyle(style);
    return safe ? ` style="${safe}"` : "";
  });

  h = h.replace(/<(\/?)(div|section|span|figure|figcaption|picture|article|main|header|footer|aside)\b([^>]*)>/gi, (_m, slash) => {
    if (slash) return "</span>";
    return "<span>";
  });

  let imgCount = 0;
  h = h.replace(/<img([^>]*?)src=["']([^"']+)["']([^>]*)>/gi, (_m, _a, src) => {
    if (imgCount >= 5) return "";
    imgCount++;
    const abs = resolveAbsoluteUrl(src, pageUrl);
    return `<p style="text-align:center;"><img src="${abs}" style="max-width:100%;height:auto;display:block;margin:8px auto;" /></p>`;
  });

  h = h.replace(/<h([1-6])([^>]*)>([\s\S]*?)<\/h\1>/gi, (_m, _lvl, _attrs, inner) => {
    const t = stripHtmlToText(inner, 300);
    return t ? `<p style="text-align:center;"><strong style="font-size:18px;color:#1e293b;">${escapeHtml(t)}</strong></p>` : "";
  });

  h = h.replace(/<label[^>]*>([\s\S]*?)<\/label>/gi, (_m, inner) => {
    const t = stripHtmlToText(inner, 120);
    return t ? `<p style="margin:8px 0;"><span style="font-weight:600;color:#334155;">${escapeHtml(t)}</span></p>` : "";
  });

  h = h.replace(/<p([^>]*)>([\s\S]*?)<\/p>/gi, (_m, attrs, inner) => {
    const t = stripHtmlToText(inner, 2000);
    if (!t) return "";
    const safe = /style=/i.test(attrs) ? attrs : ' style="margin:8px 0;line-height:1.5;color:#334155;"';
    return `<p${safe}>${inner.trim()}</p>`;
  });

  h = h.replace(/<a([^>]*href=["'][^"']+["'][^>]*)>([\s\S]*?)<\/a>/gi, (_m, attrs, inner) => {
    const t = stripHtmlToText(inner, 200);
    if (!t) return "";
    return `<a${attrs} style="color:#2563eb;">${escapeHtml(t)}</a>`;
  });

  h = h.replace(/<(?!\/?(?:p|a|img|strong|em|span|br)\b)[^>]+>/gi, " ");
  h = h.replace(/\s{2,}/g, " ").trim();
  return h;
}

function textToParagraphHtml(text: string): string {
  return text
    .split(/\n{2,}|(?:\u3002|\uFF01|\uFF1F|\.|\!|\?)\s+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 2)
    .map((p) => `<p style="margin:8px 0;line-height:1.5;color:#334155;">${escapeHtml(p)}</p>`)
    .join("");
}

/** 网页 HTML → 邮件正文（主内容区文字与排版，不含导航 SEO） */
export function buildEmailBodyHtmlFromPage(html: string, pageUrl: string): string {
  const fragment = extractMainHtmlFragment(html);
  if (!fragment) {
    throw new Error("未能从网页提取主内容，请换链接或改用上传截图。");
  }

  const loginLayout = buildLoginPageEmailHtml(fragment);
  if (loginLayout && stripHtmlToText(loginLayout, 10000).length >= 20) {
    return loginLayout;
  }

  let body = sanitizeFragmentForQuill(fragment, pageUrl);
  const visible = stripHtmlToText(body, 20000);
  if (visible.length < 24) {
    body = textToParagraphHtml(stripHtmlToText(fragment, 12000));
  }
  if (stripHtmlToText(body, 20000).length < 12) {
    throw new Error("未能从网页提取足够正文，请换链接或改用上传截图。");
  }
  return body;
}
