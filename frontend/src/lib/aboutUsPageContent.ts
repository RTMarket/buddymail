import type { SiteLocale } from "../i18n/siteLocaleTypes";

/** 概览 · 关于我们：中/英宣发视频（public/videos；原短版已迁至 /products/email） */
export const ABOUT_US_PROMO_VIDEO_SRC_ZH = "/videos/bss-about-us-promo-zh.mp4";
export const ABOUT_US_PROMO_VIDEO_SRC_EN = "/videos/bss-about-us-promo-en.mp4";

/** 企业邮件营销产品页：原关于我们短版介绍（中/英） */
export const EMAIL_PRODUCT_PROMO_VIDEO_SRC_ZH = "/videos/bss-standalone-promo-zh.mp4";
export const EMAIL_PRODUCT_PROMO_VIDEO_SRC_EN = "/videos/bss-standalone-promo-en.mp4";

export function emailProductPromoVideoSrc(locale: SiteLocale): string {
  return locale === "en" ? EMAIL_PRODUCT_PROMO_VIDEO_SRC_EN : EMAIL_PRODUCT_PROMO_VIDEO_SRC_ZH;
}

export function aboutUsPromoVideoSrc(locale: SiteLocale): string {
  return locale === "en" ? ABOUT_US_PROMO_VIDEO_SRC_EN : ABOUT_US_PROMO_VIDEO_SRC_ZH;
}

/** 关于我们底部 · 自动拓客实战手册海报 */
export const ACQUISITION_HANDBOOK_PROMO_IMAGE_SRC = "/images/bss-acquisition-handbook-promo.png";
export const ACQUISITION_HANDBOOK_PRICE_YUAN = "19.90";
