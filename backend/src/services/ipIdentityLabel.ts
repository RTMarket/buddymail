/** 从 ip-api 响应 + IP 解析「归属称呼」（爬虫 / VPS / 代理等） */
export type IpIdentityCategory = "crawler" | "hosting" | "proxy" | "normal" | "private" | "unknown";

export type IpIdentityInfo = {
  identityLabel: string;
  identityCategory: IpIdentityCategory;
  /** 给管理员看的简短说明 */
  identityHint: string;
};

type GeoHints = {
  reverse?: string;
  org?: string;
  isp?: string;
  hosting?: boolean;
  proxy?: boolean;
};

const BAIDU_SPIDER_PREFIXES = ["116.179.37.", "116.179.32.", "220.181.108.", "123.125.66.", "123.125.71."];

function lower(s: unknown): string {
  return typeof s === "string" ? s.toLowerCase() : "";
}

export function resolveIpIdentity(ipRaw: string, geo?: GeoHints): IpIdentityInfo {
  const ip = ipRaw.trim();
  if (!ip) {
    return { identityLabel: "—", identityCategory: "unknown", identityHint: "" };
  }

  const rev = lower(geo?.reverse);
  const org = lower(geo?.org);
  const isp = lower(geo?.isp);

  if (rev.includes("baiduspider") || rev.includes("crawl.baidu.com")) {
    return {
      identityLabel: "百度蜘蛛",
      identityCategory: "crawler",
      identityHint: "百度搜索爬虫，用于收录页面；一般勿拉黑。"
    };
  }
  if (BAIDU_SPIDER_PREFIXES.some((p) => ip.startsWith(p))) {
    return {
      identityLabel: "百度蜘蛛",
      identityCategory: "crawler",
      identityHint: "百度爬虫常用网段（116.179.37.x 等）；一般勿拉黑。"
    };
  }
  if (rev.includes("googlebot") || rev.includes("google.com")) {
    return {
      identityLabel: "Google 爬虫",
      identityCategory: "crawler",
      identityHint: "Google 搜索爬虫。"
    };
  }
  if (rev.includes("bingbot") || rev.includes("search.msn.com")) {
    return {
      identityLabel: "Bing 爬虫",
      identityCategory: "crawler",
      identityHint: "微软 Bing 搜索爬虫。"
    };
  }
  if (rev.includes("yandex") || rev.includes("petalbot") || rev.includes("bytespider")) {
    return {
      identityLabel: "其他搜索引擎爬虫",
      identityCategory: "crawler",
      identityHint: "第三方搜索/抓取爬虫。"
    };
  }

  if (org.includes("racknerd") || rev.includes("racknerd")) {
    return {
      identityLabel: "RackNerd VPS",
      identityCategory: "hosting",
      identityHint: "美国廉价 VPS 常见服务商；可能是您自购服务器、脚本或他人租用机。"
    };
  }
  if (rev.includes("colocrossing") || org.includes("colocrossing")) {
    return {
      identityLabel: "ColoCrossing 机房",
      identityCategory: "hosting",
      identityHint: "美国机房出口，RackNerd 等常走此线路。"
    };
  }
  if (org.includes("amazon") || isp.includes("amazon") || rev.includes("amazonaws")) {
    return {
      identityLabel: "AWS 云主机",
      identityCategory: "hosting",
      identityHint: "亚马逊云服务器出口。"
    };
  }
  if (geo?.hosting) {
    return {
      identityLabel: "数据中心 / VPS",
      identityCategory: "hosting",
      identityHint: "机房或云主机 IP，非家庭宽带。"
    };
  }
  if (geo?.proxy) {
    return {
      identityLabel: "代理 / VPN 出口",
      identityCategory: "proxy",
      identityHint: "可能被识别为代理或 VPN 节点。"
    };
  }

  return {
    identityLabel: "普通访问",
    identityCategory: "normal",
    identityHint: "未识别为已知爬虫或机房，可能为家庭/办公宽带。"
  };
}
