import crypto from "node:crypto";

const CREATIVE_CENTER_SECRET = "A7B&9z#1G6$2K@8M!3";
const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export type CreativeCenterSignHeaders = {
  accept: string;
  "anonymous-user-id": string;
  timestamp: string;
  "user-sign": string;
  "web-id"?: string;
  "user-agent": string;
};

export async function fetchCreativeCenterWebId(
  userAgent = DEFAULT_UA
): Promise<string> {
  const res = await fetch("https://mcs-sg.tiktokv.com/v1/user/webid", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_id: 345918,
      url: "https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/en",
      user_agent: userAgent,
      referer: "",
      user_unique_id: ""
    })
  });
  if (!res.ok) {
    throw new Error(`Creative Center webid HTTP ${res.status}`);
  }
  const body = (await res.json()) as { web_id?: string | number };
  if (body.web_id == null || body.web_id === "") {
    throw new Error("Creative Center webid missing");
  }
  return String(body.web_id);
}

export function buildCreativeCenterSignHeaders(
  webId: string,
  userId = crypto.randomUUID(),
  userAgent = DEFAULT_UA
): CreativeCenterSignHeaders {
  const timestamp = Math.floor(Date.now() / 1000);
  const seed = `${CREATIVE_CENTER_SECRET}-${webId}-${timestamp}`;
  const hash = crypto.createHash("md5").update(seed).digest("hex");
  let userSign = "";
  for (let i = 0; i < 16; i++) {
    userSign += (parseInt(hash[i]!, 16) ^ parseInt(hash[i + 16]!, 16)).toString(16);
  }
  return {
    accept: "application/json, text/plain, */*",
    "anonymous-user-id": userId,
    timestamp: String(timestamp),
    "user-sign": userSign,
    "web-id": webId,
    "user-agent": userAgent
  };
}
