import { URL_FETCH_UA } from "./emailUrlFetchShared.js";

const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;
const SCREENSHOT_TIMEOUT_MS = 120_000;

async function fetchBuffer(url: string, timeoutMs = SCREENSHOT_TIMEOUT_MS): Promise<Buffer> {
  const resp = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: { "User-Agent": URL_FETCH_UA, Accept: "image/*,*/*" },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!resp.ok) {
    throw new Error(`截图下载失败（HTTP ${resp.status}）`);
  }
  const buf = Buffer.from(await resp.arrayBuffer());
  if (buf.length > MAX_SCREENSHOT_BYTES) {
    throw new Error("页面截图过大，请换较短页面或改用上传截图");
  }
  if (buf.length < 512) {
    throw new Error("页面截图无效，请稍后重试或改用上传截图");
  }
  return buf;
}

/** 通过 Microlink 抓取网页整页截图（PNG/JPEG） */
async function captureViaMicrolink(pageUrl: string): Promise<Buffer> {
  const api = new URL("https://api.microlink.io/");
  api.searchParams.set("url", pageUrl);
  api.searchParams.set("screenshot", "true");
  api.searchParams.set("screenshot.fullPage", "true");
  api.searchParams.set("meta", "false");
  api.searchParams.set("viewport.width", "1280");
  api.searchParams.set("viewport.height", "1600");
  api.searchParams.set("viewport.deviceScaleFactor", "1");

  const resp = await fetch(api.href, {
    method: "GET",
    headers: { Accept: "application/json", "User-Agent": URL_FETCH_UA },
    signal: AbortSignal.timeout(SCREENSHOT_TIMEOUT_MS)
  });
  const data = (await resp.json()) as {
    status?: string;
    data?: { screenshot?: { url?: string } };
    message?: string;
  };
  if (data.status !== "success" || !data.data?.screenshot?.url) {
    throw new Error(data.message ?? "Microlink 截图失败");
  }
  return fetchBuffer(data.data.screenshot.url);
}

/** WordPress mshots 备用（直接返回 JPEG） */
async function captureViaMshots(pageUrl: string): Promise<Buffer> {
  const shotUrl = `https://s0.wp.com/mshots/v1/${encodeURIComponent(pageUrl)}?w=1280`;
  return fetchBuffer(shotUrl, 60_000);
}

/** 抓取网页可视区截图，供识图复刻邮件排版 */
export async function capturePageScreenshotBuffer(pageUrl: string): Promise<Buffer> {
  let lastErr: unknown;
  try {
    return await captureViaMicrolink(pageUrl);
  } catch (e) {
    lastErr = e;
  }
  try {
    return await captureViaMshots(pageUrl);
  } catch (e2) {
    lastErr = e2;
  }
  throw new Error(
    `无法生成页面截图：${String((lastErr as Error)?.message ?? lastErr)}。请改用「上传图片」模式。`
  );
}

export function screenshotBufferToDataUrl(buf: Buffer): string {
  const mime = buf[0] === 0x89 && buf[1] === 0x50 ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${buf.toString("base64")}`;
}
