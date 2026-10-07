import React, { useEffect, useMemo, useState } from "react";
import { PageShell } from "../components/PageShell";
import { SectionCard } from "../components/SectionCard";
import { StandaloneApiV1DocPanel } from "../components/automation/StandaloneApiV1DocPanel";
import { useSiteLocale } from "../../i18n/SiteLocaleContext";
import {
  createTenantApiKey,
  createTenantWebhook,
  deleteTenantWebhook,
  listTenantApiKeys,
  listTenantWebhooks,
  revokeTenantApiKey,
  toggleTenantWebhook,
  type TenantApiKeyRecord,
  type TenantWebhookEndpoint
} from "../../lib/standaloneApiAccess";

function fmtDate(s: string | null, locale: string): string {
  if (!s) return locale === "en" ? "Never" : "从未";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString(locale === "en" ? "en-US" : "zh-CN", { hour12: false });
}

export function StandaloneApiAccessPage() {
  const { locale } = useSiteLocale();
  const en = locale === "en";
  const [keys, setKeys] = useState<TenantApiKeyRecord[]>([]);
  const [webhooks, setWebhooks] = useState<TenantWebhookEndpoint[]>([]);
  const [keyName, setKeyName] = useState("Default automation key");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [webhookSecret, setWebhookSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const activeKeys = useMemo(() => keys.filter((key) => !key.revokedAt), [keys]);
  const curlExample = useMemo(
    () => `curl -sS "${window.location.origin}/api/v1/me" \\\n  -H "Authorization: Bearer ${secret ?? "bss_live_xxx"}"`,
    [secret]
  );

  async function load() {
    setBusy("load");
    try {
      const [nextKeys, nextWebhooks] = await Promise.all([listTenantApiKeys(), listTenantWebhooks()]);
      setKeys(nextKeys);
      setWebhooks(nextWebhooks);
    } catch (e) {
      setMsg(String((e as Error)?.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onCreateKey() {
    setBusy("key");
    setMsg(null);
    try {
      const created = await createTenantApiKey(keyName.trim() || "Automation key");
      setSecret(created.secret);
      await load();
    } catch (e) {
      setMsg(String((e as Error)?.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  async function onCreateWebhook() {
    setBusy("webhook");
    setMsg(null);
    try {
      const created = await createTenantWebhook(webhookUrl.trim());
      setWebhookSecret(created.secret);
      setWebhookUrl("");
      await load();
    } catch (e) {
      setMsg(String((e as Error)?.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <PageShell
      title={en ? "API access" : "API 对接"}
      description={
        en
          ? "Generate an API key and connect your own automation tools to BigSocialBoss email marketing."
          : "生成 API Key，将您自己的 n8n、脚本或 AI 自动化工具接入 BigSocialBoss 邮件营销。"
      }
    >
      {msg ? <div className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">{msg}</div> : null}

      <div className="space-y-4">
        <SectionCard
          title={en ? "Supported automation tools" : "支持的自动化工具"}
          description={
            en
              ? "Standard REST at /api/v1/* with your API key. Full endpoint list and examples are in the API docs."
              : "使用 API Key 调用标准 REST 接口 /api/v1/*。完整端点与示例见下方 API 文档。"
          }
        >
          <ul className="space-y-3 text-sm leading-relaxed text-slate-700">
            <li>
              <span className="font-semibold text-slate-900">n8n</span>
              {en
                ? " — HTTP Request node against /api/v1; build scheduled sends, quota checks, and multi-step flows."
                : " — 用 HTTP 节点对接 /api/v1；可编排定时发信、配额判断与多步流程。"}
            </li>
            <li>
              <span className="font-semibold text-slate-900">{en ? "Cursor / Codex / scripts" : "Cursor / Codex / 脚本"}</span>
              {en
                ? " — Bearer API key with curl, Python, or any HTTP client; see the linked docs for a full send flow."
                : " — Bearer API Key + curl、Python 或任意 HTTP 客户端；完整发信流程见链接文档。"}
            </li>
            <li>
              <span className="font-semibold text-slate-900">Zapier / Make</span>
              {en
                ? " — No native app; use Webhooks (outbound events below) plus HTTP modules to call the API."
                : " — 无官方 App；用 Webhook（下方出站事件）+ HTTP 模块调用 API。"}
            </li>
            <li>
              <span className="font-semibold text-slate-900">{en ? "Trigger email sends" : "自动触发邮件"}</span>
              {en
                ? " — Preview audience → create campaign → POST send → poll progress. Webhooks: email.send.completed, email.send.daily_limit_reached, email.campaign.stopped."
                : " — 预览受众 → 创建活动 → POST 发送 → 轮询进度。Webhook：email.send.completed、email.send.daily_limit_reached、email.campaign.stopped。"}
            </li>
          </ul>
          <p className="mt-3 text-xs text-slate-500">
            {en
              ? "AI copy generation uses your own LLM in the workflow, then call this API with an existing template. Open/click stats are available via GET stats (polling), not real-time webhooks."
              : "AI 文案请在工作流中接入您自己的 LLM，再调用本 API（须使用已有邮件模版）。打开/点击等行为请通过 GET stats 轮询，暂无实时 Webhook。"}
          </p>
        </SectionCard>

        <SectionCard
          title={en ? "API keys" : "API Key"}
          description={
            en
              ? "The plaintext key is shown only once. Store it in your automation tool as a secret."
              : "明文 Key 只显示一次，请保存到您的自动化工具密钥里。"
          }
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              className="h-10 flex-1 rounded-md border border-slate-200 px-3 text-sm"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder={en ? "Key name" : "Key 名称"}
            />
            <button
              type="button"
              className="h-10 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:bg-slate-300"
              disabled={busy === "key"}
              onClick={() => void onCreateKey()}
            >
              {en ? "Create key" : "生成 Key"}
            </button>
          </div>
          {secret ? (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs font-semibold text-emerald-900">
                {en ? "Copy now. It will not be shown again." : "请立即复制，之后不会再显示。"}
              </p>
              <code className="mt-2 block break-all rounded bg-white px-2 py-1 text-xs text-slate-900">{secret}</code>
            </div>
          ) : null}
          <div className="mt-3 space-y-2">
            {activeKeys.length === 0 ? (
              <p className="text-sm text-slate-500">{en ? "No active API keys." : "暂无有效 API Key。"}</p>
            ) : null}
            {activeKeys.map((key) => (
              <div key={key.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <div>
                  <p className="font-semibold text-slate-900">{key.name}</p>
                  <p className="text-xs text-slate-500">
                    {key.keyPrefix}… · {en ? "Last used" : "最后使用"}：{fmtDate(key.lastUsedAt, locale)}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-xs font-semibold text-rose-700"
                  onClick={() => void revokeTenantApiKey(key.id).then(load)}
                >
                  {en ? "Delete" : "删除"}
                </button>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title={en ? "Webhook endpoints" : "Webhook 回调"}
          description={en ? "Receive send-completed and limit-reached events." : "接收发送完成、日上限触达等事件。"}
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              className="h-10 flex-1 rounded-md border border-slate-200 px-3 text-sm"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://example.com/bss-webhook"
            />
            <button
              type="button"
              className="h-10 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white disabled:bg-slate-300"
              disabled={busy === "webhook" || !webhookUrl.trim()}
              onClick={() => void onCreateWebhook()}
            >
              {en ? "Add webhook" : "添加回调"}
            </button>
          </div>
          {webhookSecret ? (
            <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3">
              <p className="text-xs font-semibold text-sky-900">{en ? "Webhook signing secret" : "Webhook 签名密钥"}</p>
              <code className="mt-2 block break-all rounded bg-white px-2 py-1 text-xs text-slate-900">{webhookSecret}</code>
            </div>
          ) : null}
          <div className="mt-3 space-y-2">
            {webhooks.map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="break-all font-semibold text-slate-900">{item.url}</p>
                  <div className="flex gap-2">
                    <button type="button" className="text-xs font-semibold text-slate-700" onClick={() => void toggleTenantWebhook(item.id, !item.enabled).then(load)}>
                      {item.enabled ? (en ? "Disable" : "停用") : en ? "Enable" : "启用"}
                    </button>
                    <button type="button" className="text-xs font-semibold text-rose-700" onClick={() => void deleteTenantWebhook(item.id).then(load)}>
                      {en ? "Delete" : "删除"}
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {item.events.join(", ")}
                  {item.lastError ? ` · ${en ? "Last error" : "最近错误"}：${item.lastError}` : ""}
                </p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title={en ? "Quick test" : "快速测试"} description={en ? "Use the copied key in any HTTP client." : "在任意 HTTP 客户端里使用复制的 Key。"}>
          <pre className="overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-50">{curlExample}</pre>
        </SectionCard>

        <StandaloneApiV1DocPanel locale={locale} />
      </div>
    </PageShell>
  );
}

export default StandaloneApiAccessPage;
