import type { SiteLocale } from "../i18n/siteLocaleTypes";

const decode = (codes: number[]) => String.fromCharCode(...codes);

const COMMON = {
  brandName: [66, 105, 103, 83, 111, 99, 105, 97, 108, 66, 111, 115, 115],
  poweredByPrefix: [80, 111, 119, 101, 114, 101, 100, 32, 98, 121, 32],
  officialDomains: [79, 102, 102, 105, 99, 105, 97, 108, 32, 100, 111, 109, 97, 105, 110, 115, 58]
} as const;

const ZH = {
  landingRegister: [20813, 36153, 27880, 20876],
  landingLogin: [30331, 24405]
} as const;

const EN = {
  landingRegister: [83, 105, 103, 110, 32, 117, 112, 32, 102, 114, 101, 101],
  landingLogin: [76, 111, 103, 32, 105, 110]
} as const;

export function getRuntimeBrandText(locale: SiteLocale) {
  const local = locale === "en" ? EN : ZH;
  return {
    brandName: decode([...COMMON.brandName]),
    poweredBy: decode([...COMMON.poweredByPrefix, ...COMMON.brandName]),
    officialDomains: decode([...COMMON.officialDomains]),
    landingRegister: decode([...local.landingRegister]),
    landingLogin: decode([...local.landingLogin])
  };
}
