/** Leads 搜索：洲 / 国家 / 省州 选项（国家名 zh-CN 由 Intl 生成） */

import iso3166 from "./iso3166-countries.json";
import { COUNTRY_GEO } from "./leadsGeoData";

export const CONTINENT_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "不限" },
  { value: "asia", label: "亚洲" },
  { value: "europe", label: "欧洲" },
  { value: "africa", label: "非洲" },
  { value: "north_america", label: "北美洲" },
  { value: "south_america", label: "南美洲" },
  { value: "oceania", label: "大洋洲" },
  { value: "antarctica", label: "南极洲" }
];

type Iso3166Row = {
  "alpha-2": string;
  "region-code": string | null;
  "intermediate-region-code": string | null;
};

function mapIsoRowToUiContinent(row: Iso3166Row): string | undefined {
  const a2 = row["alpha-2"];
  if (!a2 || a2.length !== 2) return undefined;
  if (a2 === "AQ") return "antarctica";
  const rc = String(row["region-code"] ?? "");
  const ir = String(row["intermediate-region-code"] ?? "");
  if (rc === "142") return "asia";
  if (rc === "150") return "europe";
  if (rc === "002") return "africa";
  if (rc === "009") return "oceania";
  if (rc === "019") {
    if (ir === "005") return "south_america";
    return "north_america";
  }
  if (a2 === "TW") return "asia";
  return undefined;
}

/** ISO 3166-1 alpha-2 → 本页「七大洲」value（asia / europe / …） */
const ISO2_TO_UI_CONTINENT: Readonly<Record<string, string>> = (() => {
  const m: Record<string, string> = {};
  for (const row of iso3166 as Iso3166Row[]) {
    const k = row["alpha-2"];
    const v = mapIsoRowToUiContinent(row);
    if (k && v) m[k] = v;
  }
  m.TW = "asia";
  return m;
})();

export function iso2MatchesUiContinent(iso2: string, continent: string): boolean {
  if (!continent) return true;
  if (!iso2) return true;
  return ISO2_TO_UI_CONTINENT[iso2] === continent;
}

/** 按所选「洲」过滤国家；洲为「不限」时返回全部 */
export function getCountryOptionsZhFiltered(continent: string): { value: string; label: string }[] {
  const all = getCountryOptionsZh();
  if (!continent) return all;
  const rest = all
    .filter((o) => o.value && ISO2_TO_UI_CONTINENT[o.value] === continent)
    .sort((a, b) => a.label.localeCompare(b.label, "zh-CN"));
  return [{ value: "", label: "不限" }, ...rest];
}

/** 中国省级行政区（名称作 value，便于后续对接） */
export const CN_PROVINCE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "不限" },
  { value: "北京市", label: "北京市" },
  { value: "天津市", label: "天津市" },
  { value: "上海市", label: "上海市" },
  { value: "重庆市", label: "重庆市" },
  { value: "河北省", label: "河北省" },
  { value: "山西省", label: "山西省" },
  { value: "辽宁省", label: "辽宁省" },
  { value: "吉林省", label: "吉林省" },
  { value: "黑龙江省", label: "黑龙江省" },
  { value: "江苏省", label: "江苏省" },
  { value: "浙江省", label: "浙江省" },
  { value: "安徽省", label: "安徽省" },
  { value: "福建省", label: "福建省" },
  { value: "江西省", label: "江西省" },
  { value: "山东省", label: "山东省" },
  { value: "河南省", label: "河南省" },
  { value: "湖北省", label: "湖北省" },
  { value: "湖南省", label: "湖南省" },
  { value: "广东省", label: "广东省" },
  { value: "海南省", label: "海南省" },
  { value: "四川省", label: "四川省" },
  { value: "贵州省", label: "贵州省" },
  { value: "云南省", label: "云南省" },
  { value: "陕西省", label: "陕西省" },
  { value: "甘肃省", label: "甘肃省" },
  { value: "青海省", label: "青海省" },
  { value: "台湾省", label: "台湾省" },
  { value: "内蒙古自治区", label: "内蒙古自治区" },
  { value: "广西壮族自治区", label: "广西壮族自治区" },
  { value: "西藏自治区", label: "西藏自治区" },
  { value: "宁夏回族自治区", label: "宁夏回族自治区" },
  { value: "新疆维吾尔自治区", label: "新疆维吾尔自治区" },
  { value: "香港特别行政区", label: "香港特别行政区" },
  { value: "澳门特别行政区", label: "澳门特别行政区" }
];

/** 美国州/特区（value 为 USPS 二位码） */
export const US_STATE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "不限" },
  { value: "AL", label: "Alabama" },
  { value: "AK", label: "Alaska" },
  { value: "AZ", label: "Arizona" },
  { value: "AR", label: "Arkansas" },
  { value: "CA", label: "California" },
  { value: "CO", label: "Colorado" },
  { value: "CT", label: "Connecticut" },
  { value: "DE", label: "Delaware" },
  { value: "DC", label: "District of Columbia" },
  { value: "FL", label: "Florida" },
  { value: "GA", label: "Georgia" },
  { value: "HI", label: "Hawaii" },
  { value: "ID", label: "Idaho" },
  { value: "IL", label: "Illinois" },
  { value: "IN", label: "Indiana" },
  { value: "IA", label: "Iowa" },
  { value: "KS", label: "Kansas" },
  { value: "KY", label: "Kentucky" },
  { value: "LA", label: "Louisiana" },
  { value: "ME", label: "Maine" },
  { value: "MD", label: "Maryland" },
  { value: "MA", label: "Massachusetts" },
  { value: "MI", label: "Michigan" },
  { value: "MN", label: "Minnesota" },
  { value: "MS", label: "Mississippi" },
  { value: "MO", label: "Missouri" },
  { value: "MT", label: "Montana" },
  { value: "NE", label: "Nebraska" },
  { value: "NV", label: "Nevada" },
  { value: "NH", label: "New Hampshire" },
  { value: "NJ", label: "New Jersey" },
  { value: "NM", label: "New Mexico" },
  { value: "NY", label: "New York" },
  { value: "NC", label: "North Carolina" },
  { value: "ND", label: "North Dakota" },
  { value: "OH", label: "Ohio" },
  { value: "OK", label: "Oklahoma" },
  { value: "OR", label: "Oregon" },
  { value: "PA", label: "Pennsylvania" },
  { value: "RI", label: "Rhode Island" },
  { value: "SC", label: "South Carolina" },
  { value: "SD", label: "South Dakota" },
  { value: "TN", label: "Tennessee" },
  { value: "TX", label: "Texas" },
  { value: "UT", label: "Utah" },
  { value: "VT", label: "Vermont" },
  { value: "VA", label: "Virginia" },
  { value: "WA", label: "Washington" },
  { value: "WV", label: "West Virginia" },
  { value: "WI", label: "Wisconsin" },
  { value: "WY", label: "Wyoming" }
];

const FALLBACK_COUNTRY_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "不限" },
  { value: "CN", label: "中国" },
  { value: "US", label: "美国" },
  { value: "JP", label: "日本" },
  { value: "KR", label: "韩国" },
  { value: "GB", label: "英国" },
  { value: "DE", label: "德国" },
  { value: "FR", label: "法国" },
  { value: "CA", label: "加拿大" },
  { value: "AU", label: "澳大利亚" },
  { value: "IN", label: "印度" },
  { value: "BR", label: "巴西" },
  { value: "RU", label: "俄罗斯" },
  { value: "SG", label: "新加坡" },
  { value: "MY", label: "马来西亚" },
  { value: "TH", label: "泰国" },
  { value: "VN", label: "越南" },
  { value: "ID", label: "印度尼西亚" },
  { value: "PH", label: "菲律宾" },
  { value: "MX", label: "墨西哥" },
  { value: "IT", label: "意大利" },
  { value: "ES", label: "西班牙" },
  { value: "NL", label: "荷兰" },
  { value: "CH", label: "瑞士" },
  { value: "SE", label: "瑞典" },
  { value: "NZ", label: "新西兰" }
];

/** 使用浏览器 Intl 生成全球国家/地区中文名（ISO 3166-1 alpha-2） */
export function getCountryOptionsZh(): { value: string; label: string }[] {
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    if (typeof supported !== "function") {
      const rest = FALLBACK_COUNTRY_OPTIONS.filter((x) => x.value !== "");
      rest.sort((a, b) => (a.label || "").localeCompare(b.label || "", "zh-CN"));
      return [{ value: "", label: "不限" }, ...rest];
    }
    const codes = supported.call(Intl, "region");
    const dn = new Intl.DisplayNames(["zh-CN"], { type: "region" });
    const rows = codes
      .filter((c) => typeof c === "string" && /^[A-Z]{2}$/.test(c))
      .map((c) => ({ value: c, label: dn.of(c) || c }))
      .sort((a, b) => a.label.localeCompare(b.label, "zh-CN"));
    return [{ value: "", label: "不限" }, ...rows];
  } catch {
    const rest = FALLBACK_COUNTRY_OPTIONS.filter((x) => x.value !== "");
    rest.sort((a, b) => (a.label || "").localeCompare(b.label || "", "zh-CN"));
    return [{ value: "", label: "不限" }, ...rest];
  }
}

export function getProvinceOptionsForCountry(countryCode: string): { value: string; label: string }[] {
  const geo = COUNTRY_GEO[countryCode];
  if (geo && geo.length) {
    return [{ value: "", label: "不限" }, ...geo.map((s) => ({ value: s.value, label: s.label }))];
  }
  if (countryCode === "CN") return CN_PROVINCE_OPTIONS;
  if (countryCode === "US") return US_STATE_OPTIONS;
  return [{ value: "", label: "不限（暂无该国省/州数据）" }];
}

/** 有省/州-城市数据的国家：返回所选省/州下属城市；无数据的国家返回空数组（页面降级为手动输入） */
export function getCityOptionsForCountry(countryCode: string, province?: string): { value: string; label: string }[] {
  const geo = COUNTRY_GEO[countryCode];
  if (!geo || !geo.length) return [];
  const st = geo.find((s) => s.value === province);
  if (!st) return [{ value: "", label: "不限" }];
  return [{ value: "", label: "不限" }, ...st.cities.map((c) => ({ value: c.value, label: c.label }))];
}
