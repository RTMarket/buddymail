import type { SiteLocale } from "./siteLocaleTypes";

export type SiteFooterStrings = {
  contactHeading: string;
  companyName: string;
  phoneLabel: string;
  emailLabel: string;
  followHeading: string;
  followBody: string;
  linkedInAria: string;
  wechatHeading: string;
  wechatContact: string;
  wechatHint: string;
  wechatQrAlt: string;
};

export function getSiteFooterStrings(locale: SiteLocale): SiteFooterStrings {
  if (locale === "en") {
    return {
      contactHeading: "Contact",
      companyName: "HONG KONG PRIME HARMONY SUPPLY CHAIN MANAGEMENT LIMITED",
      phoneLabel: "Phone · ",
      emailLabel: "Email · ",
      followHeading: "Follow us",
      followBody: "Product updates on LinkedIn",
      linkedInAria: "Follow BigSocialBoss on LinkedIn",
      wechatHeading: "WeChat QR",
      wechatContact: "Contact support",
      wechatHint: "Sales & support",
      wechatQrAlt: "BigSocialBoss WeChat support QR code"
    };
  }
  return {
    contactHeading: "企业联系",
    companyName: "香港佳和供應鏈管理有限公司",
    phoneLabel: "电话 · ",
    emailLabel: "邮箱 · ",
    followHeading: "关注我们",
    followBody: "在 LinkedIn 了解 BigSocialBoss 产品动态",
    linkedInAria: "在 LinkedIn 关注 BigSocialBoss",
    wechatHeading: "扫码添加微信",
    wechatContact: "联系客服",
    wechatHint: "商务与支持咨询",
    wechatQrAlt: "BigSocialBoss 微信联系人二维码"
  };
}
