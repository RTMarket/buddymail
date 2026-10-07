export const EMAIL_PLATFORM_BRAND_TEXT = "BigSocialBoss, experience a different email marketing tool.";

export function buildEmailPlatformBrandingFooterHtml(): string {
  return (
    `<div style="margin-top:16px;padding-top:10px;border-top:1px solid #e5e7eb;font-size:11px;line-height:1.5;color:#94a3b8;text-align:center;">` +
    EMAIL_PLATFORM_BRAND_TEXT +
    `</div>`
  );
}
