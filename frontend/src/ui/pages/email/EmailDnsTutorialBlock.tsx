import React, { useState } from "react";

/**
 * EmailDnsTutorialBlock — 各家域名服务商 DNS 后台「如何添加 CNAME / TXT 记录」教程。
 *
 * 适用场景：
 *   - 用户在 SES 发件域名向导第 2 步拿到 3 条 DKIM CNAME 后，不知道怎么贴到自家 DNS 后台。
 *   - 同样适用于手动维护 SPF / DMARC 的老玩家。
 *
 * 设计原则：
 *   - 默认折叠（避免占据 SES 流程的视觉重心），点击「如何在我的 DNS 后台添加记录？」展开。
 *   - 内容沿用原 SettingsEmailPage「新增域名教程」的表述，但把语境从「手填认证」调整为
 *     「按你拿到的 CNAME / TXT 记录到 DNS 后台粘贴」。
 *   - 不持有任何业务状态、不发任何请求；纯展示组件。
 */

type DomainVendorId = "aliyun" | "tencent" | "godaddy" | "namecheap" | "namesilo" | "other";

export function EmailDnsTutorialBlock(props: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState<boolean>(props.defaultOpen ?? false);
  const [vendor, setVendor] = useState<DomainVendorId>("tencent");

  return (
    <div className="rounded-md border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        <span>
          <span className="mr-2 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
            帮助
          </span>
          如何在我的 DNS 后台添加 CNAME / TXT 记录？（按域名服务商查看步骤）
        </span>
        <span className="text-slate-400">{open ? "收起 ▴" : "展开 ▾"}</span>
      </button>

      {open ? (
        <div className="border-t border-slate-100 px-3 py-3">
          <p className="mb-2 text-xs text-slate-600">
            选择你的域名服务商查看图文步骤。无论是 SES 给的 3 条 DKIM CNAME，还是 SPF / DMARC 的
            TXT，添加方式都是相同的。
          </p>
          <p className="mb-3 rounded-md border border-slate-100 bg-slate-50 px-2.5 py-2 text-xs leading-relaxed text-slate-700">
            <strong className="text-slate-900">主机记录会不会和域名重复？</strong>
            在腾讯云 DNSPod、阿里云等后台，您是在<strong>已托管的一条域名</strong>（解析区，通常是购买的根域如{" "}
            <code className="rounded bg-white px-1">example.com</code>
            ）下新增解析：「主机记录」一般只填<strong>相对名称</strong>（如{" "}
            <code className="rounded bg-white px-1">mail</code>、
            <code className="rounded bg-white px-1">abc123._domainkey.mail</code>
            ），页面会自动显示完整 FQDN。
            上方列表已给出<strong className="font-medium">推荐填写的主机记录</strong>（相对）与完整 FQDN 对照；请勿在主机记录里再手动追加一整段根域，以免解析变成错误的嵌套域名。
          </p>

          <label className="grid max-w-sm gap-1">
            <span className="text-xs text-slate-700">域名服务商</span>
            <select
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              value={vendor}
              onChange={(e) => setVendor(e.target.value as DomainVendorId)}
            >
              <option value="aliyun">阿里云（国内首选）</option>
              <option value="tencent">腾讯云（国内首选）</option>
              <option value="godaddy">GoDaddy（全球最大）</option>
              <option value="namecheap">Namecheap（性价比之王）</option>
              <option value="namesilo">NameSilo（低价稳定）</option>
              <option value="other">其他域名服务商（通用）</option>
            </select>
          </label>

          {vendor === "tencent" ? (
            <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-3 text-xs text-indigo-900">
              <div className="font-semibold">腾讯云 DNSPod 详细步骤</div>
              <ol className="mt-1 list-decimal space-y-1 pl-4 leading-relaxed">
                <li>打开腾讯云控制台，进入 DNSPod 的域名解析页面，选择你的域名。</li>
                <li>
                  添加 SES DKIM 的 3 条 CNAME：主机记录填 SES 给你的形如
                  <code className="mx-1 rounded bg-white px-1">xxx._domainkey</code>
                  的部分（不含主域名），记录类型 CNAME，TTL 默认 600，记录值粘贴 SES 给你的
                  <code className="mx-1 rounded bg-white px-1">xxx.dkim.amazonses.com</code>。
                </li>
                <li>
                  推荐 SPF：主机记录 <code className="rounded bg-white px-1">@</code>，类型 TXT，
                  值参考：
                  <div className="mt-1 rounded border border-indigo-200 bg-white px-2 py-1">
                    <code>v=spf1 include:amazonses.com ~all</code>
                  </div>
                  如果该域名已经有 SPF，**合并** include:amazonses.com 到那条已有记录里，不要建第二条。
                </li>
                <li>
                  推荐 DMARC：主机记录 <code className="rounded bg-white px-1">_dmarc</code>，类型 TXT，
                  起步用：
                  <div className="mt-1 rounded border border-indigo-200 bg-white px-2 py-1">
                    <code>v=DMARC1; p=none; rua=mailto:postmaster@你的域名; fo=1</code>
                  </div>
                </li>
              </ol>
            </div>
          ) : null}

          {vendor === "aliyun" ? (
            <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-3 text-xs text-blue-900">
              <div className="font-semibold">阿里云 DNS 详细步骤</div>
              <ol className="mt-1 list-decimal space-y-1 pl-4 leading-relaxed">
                <li>打开阿里云控制台，进入域名解析，选择目标域名。</li>
                <li>
                  添加 SES DKIM 的 3 条 CNAME：主机记录填 SES 给你的
                  <code className="mx-1 rounded bg-white px-1">xxx._domainkey</code>
                  部分，类型 CNAME，TTL 默认 600，记录值粘贴 SES 给你的目标域。
                </li>
                <li>
                  推荐 SPF：主机记录 <code className="rounded bg-white px-1">@</code>，类型 TXT，TTL 默认 600，
                  值参考：
                  <div className="mt-1 rounded border border-blue-200 bg-white px-2 py-1">
                    <code>v=spf1 include:amazonses.com ~all</code>
                  </div>
                </li>
                <li>
                  推荐 DMARC：主机记录 <code className="rounded bg-white px-1">_dmarc</code>，类型 TXT，TTL 默认 600，
                  起步用：
                  <div className="mt-1 rounded border border-blue-200 bg-white px-2 py-1">
                    <code>v=DMARC1; p=none; rua=mailto:postmaster@你的域名; fo=1</code>
                  </div>
                </li>
              </ol>
            </div>
          ) : null}

          {vendor === "godaddy" ? (
            <div className="mt-3 rounded-lg border border-violet-100 bg-violet-50 px-3 py-3 text-xs text-violet-900">
              <div className="font-semibold">GoDaddy 详细步骤（全球最大）</div>
              <ol className="mt-1 list-decimal space-y-1 pl-4 leading-relaxed">
                <li>登录 GoDaddy，进入 My Products，找到域名并点 DNS / Manage Zone。</li>
                <li>
                  添加 SES DKIM 3 条 CNAME：Type=CNAME，Name 填
                  <code className="mx-1 rounded bg-white px-1">xxx._domainkey</code>，
                  Value 填 SES 给你的
                  <code className="mx-1 rounded bg-white px-1">xxx.dkim.amazonses.com</code>。
                </li>
                <li>
                  推荐 SPF：Type=TXT，Name=<code className="rounded bg-white px-1">@</code>，
                  Value=<code className="rounded bg-white px-1">v=spf1 include:amazonses.com ~all</code>。
                </li>
                <li>
                  推荐 DMARC：Type=TXT，Name=<code className="rounded bg-white px-1">_dmarc</code>，
                  Value=<code className="rounded bg-white px-1">v=DMARC1; p=none; rua=mailto:postmaster@你的域名; fo=1</code>。
                </li>
              </ol>
            </div>
          ) : null}

          {vendor === "namecheap" ? (
            <div className="mt-3 rounded-lg border border-sky-100 bg-sky-50 px-3 py-3 text-xs text-sky-900">
              <div className="font-semibold">Namecheap 详细步骤（性价比）</div>
              <ol className="mt-1 list-decimal space-y-1 pl-4 leading-relaxed">
                <li>登录 Namecheap，Domain List → Manage → Advanced DNS。</li>
                <li>
                  添加 SES DKIM 3 条 CNAME：Type=CNAME，Host=
                  <code className="mx-1 rounded bg-white px-1">xxx._domainkey</code>，
                  Value 粘贴 SES 给的
                  <code className="mx-1 rounded bg-white px-1">xxx.dkim.amazonses.com</code>。
                </li>
                <li>
                  推荐 SPF：Type=TXT，Host=<code className="rounded bg-white px-1">@</code>，
                  Value=<code className="rounded bg-white px-1">v=spf1 include:amazonses.com ~all</code>。
                </li>
                <li>
                  推荐 DMARC：Type=TXT，Host=<code className="rounded bg-white px-1">_dmarc</code>，
                  Value=<code className="rounded bg-white px-1">v=DMARC1; p=none; rua=mailto:postmaster@你的域名; fo=1</code>。
                </li>
              </ol>
            </div>
          ) : null}

          {vendor === "namesilo" ? (
            <div className="mt-3 rounded-lg border border-fuchsia-100 bg-fuchsia-50 px-3 py-3 text-xs text-fuchsia-900">
              <div className="font-semibold">NameSilo 详细步骤（低价稳定）</div>
              <ol className="mt-1 list-decimal space-y-1 pl-4 leading-relaxed">
                <li>登录 NameSilo，Domain Manager → 选择域名 → DNS Records。</li>
                <li>
                  添加 SES DKIM 3 条 CNAME：Type=CNAME，Host=
                  <code className="mx-1 rounded bg-white px-1">xxx._domainkey</code>，
                  Value 粘贴 SES 给的
                  <code className="mx-1 rounded bg-white px-1">xxx.dkim.amazonses.com</code>。
                </li>
                <li>
                  推荐 SPF：Type=TXT，Host=<code className="rounded bg-white px-1">@</code>，
                  Value=<code className="rounded bg-white px-1">v=spf1 include:amazonses.com ~all</code>。
                </li>
                <li>
                  推荐 DMARC：Type=TXT，Host=<code className="rounded bg-white px-1">_dmarc</code>，
                  Value=<code className="rounded bg-white px-1">v=DMARC1; p=none; rua=mailto:postmaster@你的域名; fo=1</code>。
                </li>
              </ol>
            </div>
          ) : null}

          {vendor === "other" ? (
            <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-3 text-xs text-emerald-900">
              <div className="font-semibold">其他域名服务商通用步骤（Cloudflare / Route53 / Porkbun 等）</div>
              <ol className="mt-1 list-decimal space-y-1 pl-4 leading-relaxed">
                <li>进入你的域名服务商 DNS 记录管理页面（能新增 CNAME / TXT 记录即可）。</li>
                <li>
                  添加 SES DKIM 3 条 CNAME：主机记录填 SES 给你的
                  <code className="mx-1 rounded bg-white px-1">xxx._domainkey</code>
                  部分（不含主域名），记录类型 CNAME，记录值粘贴 SES 给的
                  <code className="mx-1 rounded bg-white px-1">xxx.dkim.amazonses.com</code>。
                </li>
                <li>
                  推荐 SPF：主机记录 <code className="rounded bg-white px-1">@</code>，类型 TXT，TTL 默认 600，
                  值：
                  <div className="mt-1 rounded border border-emerald-200 bg-white px-2 py-1">
                    <code>v=spf1 include:amazonses.com ~all</code>
                  </div>
                </li>
                <li>
                  推荐 DMARC：主机记录 <code className="rounded bg-white px-1">_dmarc</code>，类型 TXT，TTL 默认 600，
                  起步用：
                  <div className="mt-1 rounded border border-emerald-200 bg-white px-2 py-1">
                    <code>v=DMARC1; p=none; rua=mailto:postmaster@你的域名; fo=1</code>
                  </div>
                </li>
              </ol>
            </div>
          ) : null}

          <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-3 text-xs text-amber-900">
            <div className="font-semibold">DMARC 的 p=none / quarantine / reject 是什么？</div>
            <ul className="mt-1 list-disc space-y-1 pl-4 leading-relaxed">
              <li>
                <code>p=none</code>：只统计不拦截（最安全起步）。先确认 SPF/DKIM 都正确，邮件能正常送达。
              </li>
              <li>
                <code>p=quarantine</code>：可疑邮件进垃圾箱（中等强度）。
              </li>
              <li>
                <code>p=reject</code>：可疑邮件直接拒收（最严格）。
              </li>
            </ul>
            <div className="mt-2">
              想要"加完解析就能稳定群发"，建议顺序：先 <code>p=none</code> 跑 3-7 天，确认无大量退信/进垃圾，再升到
              <code>quarantine</code>，最后再考虑 <code>reject</code>。
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
