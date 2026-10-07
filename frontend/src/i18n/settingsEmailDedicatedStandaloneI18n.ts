import type { SiteLocale } from "./siteLocaleTypes";

const DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const RESERVED = new Set([
  "www",
  "ftp",
  "smtp",
  "mx",
  "imap",
  "pop",
  "pop3",
  "webmail",
  "autodiscover",
  "cdn",
  "api"
]);

export type SettingsEmailDedicatedStandaloneStrings = {
  loadFailed: string;
  retry: string;
  loading: string;
  deleted: string;
  laneLabel: (n: number) => string;
  groupLabel: (n: number) => string;
  domainCount: (n: number) => string;
  multiGroupTitle: (groups: number, slots: number, used: number) => string;
  multiGroupFlow: string;
  singleIpMultiDomainTitle: (slots: number, used: number) => string;
  singleIpMultiDomainFlow: string;
  tripleDomainStep1: (slots: number, used: number) => string;
  tripleDomainSlotTitle: (n: number) => string;
  tripleDomainSlotEmpty: string;
  tripleDomainSlotFilled: string;
  tripleDomainSharedVpsHint: string;
  tripleDomainConfigureTab: (domain: string) => string;
  tripleDomainSelectForSmtp: string;
  step1Domains: string;
  addDomain: string;
  noDomainInLane: string;
  pickDomainHint: string;
  step2Title: string;
  step2TabHint: string;
  prevGroup: string;
  nextGroup: string;
  domainsInGroup: string;
  loadingWorkbench: string;
  noGroupData: string;
  step3Dns: string;
  step3DnsReady: (count: number, domain: string) => string;
  step3DnsPending: string;
  step4Test: string;
  deleteDomainTitle: string;
  deleteHintReady: string;
  deleteHintOther: string;
  deleteThisDomain: string;
  confirmDelete: (label: string) => string;
  confirmDeleteLabel: string;
  profileStepTitle: string;
  profileHintNew: string;
  profileHintEdit: string;
  fieldServiceName: string;
  fieldServiceNameSub: string;
  fieldServiceNamePh: string;
  fieldSenderDomain: string;
  fieldSenderDomainPh: string;
  fieldFromName: string;
  fieldFromNamePh: string;
  fieldFromEmail: string;
  fieldFromEmailPh: string;
  fieldReplyTo: string;
  fieldReplyToPh: string;
  fieldNotes: string;
  fieldNotesPh: string;
  saveChanges: string;
  saving: string;
  saveSenderDomain: string;
  saveHintNew: string;
  saved: string;
  savedProfile: string;
  errNoLicenseTier: string;
  errServiceName: string;
  errFromName: string;
  errReplyToFormat: string;
  errSenderDomainEmpty: string;
  errSenderDomainFormat: string;
  errSenderDomainSubdomain: string;
  errSenderDomainReserved: (first: string) => string;
  errFromEmailEmpty: string;
  errFromEmailFormat: string;
  errFromEmailDomain: (domain: string) => string;
  step2VpsTitle: string;
  step2VpsPending: string;
  step3DnsTitle: string;
  step3DnsGenerated: (count: number) => string;
  step3DnsNeedGenerate: string;
  profileSyncWarning: string;
  dnsHeaderStandalone: string;
  dnsLeadStandalone: string;
  dnsFootnoteWithDomain: (domain: string) => string;
  dnsFootnoteGeneric: string;
  dnsRecordsTitle: string;
  copyAll: string;
  copiedAll: string;
  verifyDns: string;
  verifying: string;
  dnsVerifyAllOk: string;
  dnsVerifyPartial: string;
  dnsPendingNewCycleBanner: string;
  dnsInstructionsLead: string;
  dnsTencentAliyunHint: string;
  thHost: string;
  thType: string;
  thMxPriority: string;
  thValue: string;
  thRow: string;
  thVerify: string;
  fqdnHint: (fqdn: string, zone: string) => string;
  fullLabel: (fqdn: string) => string;
  mxPriorityTitle: string;
  mxValueTitle: string;
  aValueTitle: string;
  selectRow: string;
  copyRow: string;
  verified: string;
  notVerified: string;
  testSendTitle: string;
  testReady: string;
  testDisabledNoItem: string;
  testDisabledNoDns: string;
  testDisabledDns: string;
  testDisabledSmtp: string;
  recipientPh: string;
  sendTest: string;
  sending: string;
  testDelivered: string;
  testInboxHint: string;
  testFailed: string;
  copyFailure: string;
  copied: string;
  testFailureFeedback: string;
  testFooter: string;
  testSuccessLine: (recipient: string, messageId?: string) => string;
  testSuccessNote: string;
  errNoRecipient: string;
  errRecipientFormat: string;
  errTimeout: string;
  addDomainTitle: (index: number, lane?: number) => string;
  addDomainDefaultLabel: (index: number) => string;
  addDomainSaved: string;
  addDomainHint: string;
  addDomainSmtpNote: string;
  addDomainDnsNote: string;
  cancel: string;
  dnsLeadRecordsSuffix: string;
  dnsAwaitingExperienceTitle: string;
  dnsAwaitingExperience1: string;
  dnsAwaitingExperience2: string;
  dnsAwaitingExperience3: string;
  dnsAwaitingExperience4: string;
  quotaOverTitle: string;
  quotaOverBody: (over: number, slots: number) => string;
  quotaOverFootnote: string;
  dnsSelectAll: string;
  dnsCopyBtn: string;
  dnsCopiedBtn: string;
  rejectedTitle: string;
  rejectedDesc: string;
  rejectedReasonLabel: string;
  rejectedNoReason: string;
  rejectedProcessedAt: (time: string) => string;
  rejectedContinueEdit: string;
  rejectedBusy: string;
  rejectedDelete: string;
  rejectedDeleteConfirm: string;
  rejectedDeleteConfirmLabel: string;
  rejectedReopenOk: string;
  rejectedRemoveOk: string;
  testFailureClipboard: (args: {
    item: { id: number; label?: string | null; senderDomain?: string | null; fromEmail?: string | null; status?: string } | null;
    recipient: string;
    reason: string;
    time: string;
  }) => string;
};

export function validateDedicatedSenderDomainLocalized(
  senderDomain: string,
  ui: SettingsEmailDedicatedStandaloneStrings
): string | null {
  const d = senderDomain.trim().toLowerCase();
  if (!d) return ui.errSenderDomainEmpty;
  if (!DOMAIN_RE.test(d)) return ui.errSenderDomainFormat;
  const labels = d.split(".");
  if (labels.length < 3) return ui.errSenderDomainSubdomain;
  const first = labels[0] ?? "";
  if (RESERVED.has(first)) return ui.errSenderDomainReserved(first);
  return null;
}

export function validateDedicatedFromEmailLocalized(
  fromEmail: string,
  senderDomain: string,
  ui: SettingsEmailDedicatedStandaloneStrings
): string | null {
  const email = fromEmail.trim().toLowerCase();
  const domain = senderDomain.trim().toLowerCase();
  if (!email) return ui.errFromEmailEmpty;
  if (!EMAIL_RE.test(email)) return ui.errFromEmailFormat;
  const at = email.lastIndexOf("@");
  if (email.slice(at + 1) !== domain) return ui.errFromEmailDomain(domain);
  return null;
}

export function getSettingsEmailDedicatedStandaloneStrings(
  locale: SiteLocale
): SettingsEmailDedicatedStandaloneStrings {
  if (locale === "en") {
    return {
      loadFailed: "Load failed:",
      retry: "Retry",
      loading: "Loading…",
      deleted: "Deleted",
      laneLabel: (n) => `Lane ${n}`,
      groupLabel: (n) => `Group ${n}`,
      domainCount: (n) => ` · ${n} domains`,
      multiGroupTitle: (groups, slots, used) =>
        `Multi-group plan · ${groups} VPS group(s) / ${slots} domain slots (used ${used})`,
      multiGroupFlow:
        "Suggested: ① Add domains per lane in step 1 → ② Switch group tabs for VPS / SMTP / DKIM / DNS in step 2 → ③ Copy DNS and verify in step 3 → ④ Send test email in step 4.",
      singleIpMultiDomainTitle: (slots, used) =>
        `Single-IP plan · 1 relay VPS · up to ${slots} sending domains (used ${used})`,
      singleIpMultiDomainFlow:
        "Suggested: ① Fill each domain slot below (up to 3) → ② Configure the shared VPS once, then SMTP / DKIM / DNS per domain → ③ Copy DNS → ④ Test send.",
      tripleDomainStep1: (slots, used) =>
        `1. Sending domains (up to ${slots} on one VPS · ${used} in use)`,
      tripleDomainSlotTitle: (n) => `Sending domain ${n}`,
      tripleDomainSlotEmpty: "Not configured — fill in below and click Save.",
      tripleDomainSlotFilled: "Saved — you can edit below. Use step 2 for SMTP / DNS for this domain.",
      tripleDomainSharedVpsHint:
        "Domains 2–3 use the same Relay/Mail IP and SSH as domain 1 (read-only). SMTP, port 587 test, DKIM and DNS are configured per domain.",
      tripleDomainConfigureTab: (domain) => `SMTP/DNS: ${domain}`,
      tripleDomainSelectForSmtp: "Click a saved domain above to configure its SMTP and DNS below.",
      step1Domains: "1. Sending domains (add per lane)",
      addDomain: "+ Add sending domain",
      noDomainInLane: "No sending domain on this lane — click **+ Add sending domain**.",
      pickDomainHint: "Select a domain tab above or add a new one.",
      step2Title: "2. Group VPS · SMTP · DKIM · Generate DNS",
      step2TabHint: "(use tabs or ← → / swipe to switch groups)",
      prevGroup: "Previous group",
      nextGroup: "Next group",
      domainsInGroup: "Domains in this group:",
      loadingWorkbench: "Loading workbench…",
      noGroupData: "No group data — save a sending domain in step 1 first.",
      step3Dns: "3. Add records in your DNS console",
      step3DnsReady: (count, domain) => ` (${count} records · ${domain})`,
      step3DnsPending: " (generate DNS in step 2 first)",
      step4Test: "4. Send test email",
      deleteDomainTitle: "Delete sending domain",
      deleteHintReady:
        "After delete this domain stops sending and the slot is freed; admin keeps records. Change campaigns bound to this domain first.",
      deleteHintOther: "Slot freed after delete; admin keeps a deleted record.",
      deleteThisDomain: "Delete this domain",
      confirmDelete: (label) => `Delete "${label}"?`,
      confirmDeleteLabel: "Confirm delete",
      profileStepTitle: "1. First sending domain & sender profile",
      profileHintNew:
        "(save then self-service provision below; one domain slot on this install — edit anytime and regenerate DNS)",
      profileHintEdit: "(edit and **Save changes**; new domain requires redoing step 2)",
      fieldServiceName: "Service name *",
      fieldServiceNameSub: "(for your reference across channels)",
      fieldServiceNamePh: "e.g. Main marketing / Campaign A",
      fieldSenderDomain: "Sending domain *",
      fieldSenderDomainPh: "e.g. mail.yourcompany.com (subdomain)",
      fieldFromName: "From name *",
      fieldFromNamePh: "e.g. Acme Marketing",
      fieldFromEmail: "From email *",
      fieldFromEmailPh: "e.g. marketing@mail.yourcompany.com",
      fieldReplyTo: "Reply-to (optional)",
      fieldReplyToPh: "Blank = same as from email",
      fieldNotes: "Notes (optional)",
      fieldNotesPh: "e.g. US audience / go-live May",
      saveChanges: "Save changes",
      saving: "Saving…",
      saveSenderDomain: "Save sending domain",
      saveHintNew:
        "Fill sender domain and profile, then save; provision VPS, SMTP/DKIM and DNS below.",
      saved: "Saved",
      savedProfile: "Saved",
      errNoLicenseTier: "Could not read LICENSE plan tier on this host",
      errServiceName: "Enter a service name to distinguish channels",
      errFromName: "Enter from display name",
      errReplyToFormat: "Reply-to format is invalid",
      errSenderDomainEmpty: "Enter sending domain",
      errSenderDomainFormat: "Use a subdomain, e.g. mail.yourcompany.com",
      errSenderDomainSubdomain: "Use a dedicated subdomain (≥3 labels), e.g. mail.yourcompany.com",
      errSenderDomainReserved: (first) =>
        `Use a dedicated subdomain (e.g. mail.example.com), not reserved prefix ${first}.`,
      errFromEmailEmpty: "Enter from email",
      errFromEmailFormat: "From email format is invalid",
      errFromEmailDomain: (domain) => `From email must be name@${domain}, e.g. marketing@${domain}`,
      step2VpsTitle: "2. VPS install, SMTP & generate DNS",
      step2VpsPending: "(save sending domain above first — this section expands after save)",
      step3DnsTitle: "3. Add records in your DNS console",
      step3DnsGenerated: (count) =>
        ` (${count} generated — copy to Tencent Cloud / Alibaba / Cloudflare etc.)`,
      step3DnsNeedGenerate: "(complete step 2 install and click **Generate DNS records**)",
      profileSyncWarning:
        "Profile not synced to this page. Hard refresh (⌘⇧R); if admin has your data but fields are empty, contact support for ticket #",
      dnsHeaderStandalone: "DNS records to add (shown after step 2 **Generate DNS**)",
      dnsLeadStandalone:
        "In step 2 above, enter VPS IP, finish install, and click **Generate DNS records**. Usually 5 records (",
      dnsFootnoteWithDomain: (domain) =>
        `Domain ${domain}: after generating DNS, copy to your provider and click **Verify DNS**.`,
      dnsFootnoteGeneric: "After step 2, copy records to your DNS provider and verify.",
      dnsRecordsTitle: "Add these records in your DNS console",
      copyAll: "Copy all records",
      copiedAll: "✓ All copied",
      verifyDns: "I've added them — verify DNS",
      verifying: "Verifying…",
      dnsVerifyAllOk: "✓ All DNS records verified — send a test email below.",
      dnsVerifyPartial: "Some records not live yet — check DNS and wait for propagation (1–10 min).",
      dnsPendingNewCycleBanner:
        "New plan paid — wait for DNS push to start formal period; then add records, verify DNS, and test send.",
      dnsInstructionsLead:
        "Add each record at your DNS provider (Tencent / Alibaba / Cloudflare etc.), wait 1–10 minutes, then click Verify DNS above.",
      dnsTencentAliyunHint:
        "**Tencent / Alibaba:** host column is relative only; panel adds the zone suffix. Five records: SPF, DKIM, DMARC, **A** (PTR VPS IP), **MX** (priority 10, hostname only).",
      thHost: "Host",
      thType: "Type",
      thMxPriority: "MX priority",
      thValue: "Value",
      thRow: "Row",
      thVerify: "Verify",
      fqdnHint: (fqdn, zone) => `Full: ${fqdn} (panel adds .${zone})`,
      fullLabel: (fqdn) => `Full ${fqdn}`,
      mxPriorityTitle: "Copy priority only (e.g. 10)",
      mxValueTitle: "Copy mail server hostname only",
      aValueTitle: "Copy PTR VPS public IPv4",
      selectRow: "Select row",
      copyRow: "Copy row",
      verified: "✓ Live",
      notVerified: "Pending",
      testSendTitle: "Send test email — verify your dedicated channel",
      testReady: "Ready to test",
      testDisabledNoItem: "Save sending domain before test send.",
      testDisabledNoDns: "Generate DNS in step 2 and verify in step 3 before testing.",
      testDisabledDns: "Verify all DNS records in step 3 before test send.",
      testDisabledSmtp: "Complete SMTP sync and 587 test in step 2 before test send.",
      recipientPh: "Test recipient (your inbox, e.g. you@gmail.com)",
      sendTest: "Send test email",
      sending: "Sending…",
      testDelivered: "✓ Test delivered",
      testInboxHint: "Check inbox (and spam); mark as not spam if needed.",
      testFailed: "✗ Test failed",
      copyFailure: "Copy failure details",
      copied: "✓ Copied",
      testFailureFeedback:
        "Copy the error and contact support if needed.",
      testFooter:
        "Test mail uses your dedicated IP; inbox delivery means PTR / SPF / DKIM / DMARC are ready for campaigns.",
      testSuccessLine: (recipient, messageId) =>
        `✓ Delivered to ${recipient}${messageId ? ` (messageId: ${messageId})` : ""}`,
      testSuccessNote:
        "Test sent. This standalone install is licensed — channel ready for **Campaigns**.",
      errNoRecipient: "Enter test recipient email.",
      errRecipientFormat: "Test recipient format is invalid.",
      errTimeout:
        "Timed out (~95s): backend did not respond. Check backend is running or SMTP logs.",
      addDomainTitle: (index, lane) =>
        `Add sending domain (#${index}${lane != null ? ` · Lane ${lane}` : ""})`,
      addDomainDefaultLabel: (index) => `Sending domain ${index}`,
      addDomainSaved: "Sending domain saved. Open its tab to finish DNS and test.",
      addDomainHint:
        "After save, open the new domain tab in this area for DNS and test (no need to scroll the whole page).",
      addDomainSmtpNote: "SMTP password is generated on the mail server — you do not enter it here.",
      addDomainDnsNote:
        "After save, DNS records and **Send test email** appear under that domain tab (same flow as the first domain).",
      cancel: "Cancel",
      dnsLeadRecordsSuffix: ") will appear here.",
      dnsAwaitingExperienceTitle: "After records are ready:",
      dnsAwaitingExperience1: "This area becomes a copyable table (host / type / value)",
      dnsAwaitingExperience2:
        "Paste into your DNS provider (Tencent Cloud / Alibaba / Cloudflare, etc.)",
      dnsAwaitingExperience3: 'Click **Verify DNS** when added — the platform checks propagation',
      dnsAwaitingExperience4: "You may also get an in-app notification so you do not miss the step",
      quotaOverTitle: "Sending domains exceed plan quota",
      quotaOverBody: (over, slots) =>
        `Registered ${over + slots} domains but plan allows ${slots}. Delete extras or upgrade before sending.`,
      quotaOverFootnote:
        "If you renew at the same tier or upgrade with enough slots, campaigns and test send continue. Delete domains only when downgrading below your registered count.",
      dnsSelectAll: "Select all",
      dnsCopyBtn: "Copy",
      dnsCopiedBtn: "✓ Copied",
      rejectedTitle: "Sending domain applications not approved",
      rejectedDesc:
        "Quota released. Use Continue editing to update and resubmit, or Delete to remove this notice.",
      rejectedReasonLabel: "Reason:",
      rejectedNoReason: "No reason provided — contact support.",
      rejectedProcessedAt: (time) => `Processed: ${time}`,
      rejectedContinueEdit: "Continue editing",
      rejectedBusy: "Working…",
      rejectedDelete: "Delete",
      rejectedDeleteConfirm: "Remove this rejection notice? It will no longer appear.",
      rejectedDeleteConfirmLabel: "Confirm delete",
      rejectedReopenOk: "Editing unlocked — update below and save.",
      rejectedRemoveOk: "Rejection notice removed",
      testFailureClipboard: ({ item, recipient, reason, time }) =>
        [
          "[Dedicated channel · test send failed]",
          item ? `Service ID: ${item.id}` : "(no application submitted)",
          item?.label ? `Service name: ${item.label}` : "",
          item?.senderDomain ? `Sending domain: ${item.senderDomain}` : "",
          item?.fromEmail ? `From email: ${item.fromEmail}` : "",
          `Status: ${item?.status ?? "—"}`,
          `Test recipient: ${recipient.trim() || "(empty)"}`,
          "",
          "Failure reason:",
          reason,
          "",
          `Time: ${time}`
        ]
          .filter(Boolean)
          .join("\n")
    };
  }
  return {
    loadFailed: "加载失败：",
    retry: "重试",
    loading: "加载中…",
    deleted: "已删除",
    laneLabel: (n) => `专线 ${n}`,
    groupLabel: (n) => `${n} 组机`,
    domainCount: (n) => ` · ${n} 域`,
    multiGroupTitle: (groups, slots, used) =>
      `多机组套餐 · ${groups} 组专机 / ${slots} 个发信域名额（已用 ${used}）`,
    multiGroupFlow:
      "推荐顺序：① 步骤 1 按专线添加发信域 → ② 步骤 2 切换「组机 Tab」完成 VPS / SMTP / DKIM / 生成 DNS → ③ 步骤 3 复制 DNS 并验证 → ④ 步骤 4 发送测试邮件。",
    singleIpMultiDomainTitle: (slots, used) =>
      `单 IP 套餐 · 1 台发信 VPS · 最多 ${slots} 个发信域名（已用 ${used}）`,
    singleIpMultiDomainFlow:
      "推荐顺序：① 在下方 3 个发信域槽位中逐个填写并保存 → ② 配置共用 1 台 VPS，再为每个域名分别做 SMTP / DKIM / 生成 DNS → ③ 复制 DNS → ④ 测试发信。",
    tripleDomainStep1: (slots, used) =>
      `1. 发信域名（本机 1 台 VPS · 最多 ${slots} 个 · 已用 ${used}）`,
    tripleDomainSlotTitle: (n) => `发信域名 ${n}`,
    tripleDomainSlotEmpty: "尚未填写 — 请在下方填写并点「保存发信域名」。",
    tripleDomainSlotFilled: "已保存 — 可在下方修改；步骤 2 中为该域配置 SMTP / DNS。",
    tripleDomainSharedVpsHint:
      "域名 2、3 与域名 1 共用同一台 Relay/Mail 的 IP 与 SSH（只读不可改）；各域 SMTP、587 测试、DKIM、DNS 记录独立配置。",
    tripleDomainConfigureTab: (domain) => `配置：${domain}`,
    tripleDomainSelectForSmtp: "请先点击上方已保存的域名，再在下方完成该域的 SMTP 与 DNS。",
    step1Domains: "1. 发信域名（按专线添加）",
    addDomain: "+ 新增发信域名",
    noDomainInLane: "该专线下暂无发信域，请点「+ 新增发信域名」。",
    pickDomainHint: "请选择上方发信域标签，或新增域名。",
    step2Title: "2. 机组 VPS · SMTP · DKIM · 生成 DNS",
    step2TabHint: "（点 Tab 或 ← → / 左右滑动切换组机）",
    prevGroup: "上一组机",
    nextGroup: "下一组机",
    domainsInGroup: "本组发信域：",
    loadingWorkbench: "加载装机工作台…",
    noGroupData: "暂无机组数据，请先在步骤 1 保存发信域。",
    step3Dns: "3. 在您的域名 DNS 后台添加记录",
    step3DnsReady: (count, domain) => `（${count} 条 · ${domain}）`,
    step3DnsPending: "（请先在步骤 2 生成 DNS）",
    step4Test: "4. 发送测试邮件",
    deleteDomainTitle: "删除发信域",
    deleteHintReady:
      "删除后该域将不再用于发送，名额释放；后台保留记录供统计。若营销活动仍绑定此域，请先在活动中改选其他发信域。",
    deleteHintOther: "删除后名额将释放，后台保留「已删除」记录。",
    deleteThisDomain: "删除此发信域",
    confirmDelete: (label) => `确认删除「${label}」？`,
    confirmDeleteLabel: "确认删除",
    profileStepTitle: "1. 填写您的首个发件域名与发件人资料",
    profileHintNew: "（保存后可在下方自助装机；本机仅 1 个发信域名额，可随时修改并重新生成 DNS）",
    profileHintEdit: "（可修改后点「保存修改」；换域后请重新执行步骤 2）",
    fieldServiceName: "服务名称 *",
    fieldServiceNameSub: "（仅自己看，便于您区分多个发送通道）",
    fieldServiceNamePh: "例：主营销服务 / 海外活动 A",
    fieldSenderDomain: "发件域名 *",
    fieldSenderDomainPh: "例：mail.yourcompany.com（须为子域名）",
    fieldFromName: "发件人显示名 *",
    fieldFromNamePh: "例：BigSocialBoss 运营组",
    fieldFromEmail: "发件邮箱 *",
    fieldFromEmailPh: "例：marketing@mail.yourcompany.com",
    fieldReplyTo: "回信地址（可选）",
    fieldReplyToPh: "留空 = 与发件邮箱一致",
    fieldNotes: "备注 / 期望机房 / 上线时间（可选）",
    fieldNotesPh: "例：主要发美国 / 希望机房 US-West / 期望 5 月内上线 / 已有部分客户名单",
    saveChanges: "保存修改",
    saving: "保存中…",
    saveSenderDomain: "保存发信域名",
    saveHintNew: "填写发件域名与发件人资料后点击保存；保存后可在下方完成 VPS 装机、SMTP/DKIM，生成 DNS 记录后再粘贴到域名服务商。",
    saved: "已保存",
    savedProfile: "已保存",
    errNoLicenseTier: "未读取到本机 LICENSE 套餐档位",
    errServiceName: "请给这条服务起个名字，便于您后续区分多个发送通道",
    errFromName: "请填写发件人显示名",
    errReplyToFormat: "回信地址格式不正确",
    errSenderDomainEmpty: "请填写发件域名",
    errSenderDomainFormat: "发件域名须为子域名格式，例如 mail.yourcompany.com",
    errSenderDomainSubdomain: "发件域名须为独立子域（至少三段），例如 mail.yourcompany.com",
    errSenderDomainReserved: (first) =>
      `请使用专用发信子域（推荐 mail.主域.com），不要使用 ${first}. 等系统保留子域`,
    errFromEmailEmpty: "请填写发件邮箱",
    errFromEmailFormat: "发件邮箱格式不正确",
    errFromEmailDomain: (domain) => `发件邮箱须为「名称@${domain}」格式，例如 marketing@${domain}`,
    step2VpsTitle: "2. VPS 装机、SMTP 与生成 DNS",
    step2VpsPending: "（请先完成上方「保存发信域名」，保存后本区将展开机组 / SMTP / DKIM 操作）",
    step3DnsTitle: "3. 在您的域名 DNS 后台添加记录",
    step3DnsGenerated: (count) => `（已生成 ${count} 条，请复制到腾讯云 / 阿里云 / Cloudflare 等）`,
    step3DnsNeedGenerate: "（请先在步骤 2 完成装机并点击「生成 DNS 记录」）",
    profileSyncWarning: "发件资料暂未从服务器同步到本页。请点浏览器强制刷新（⌘⇧R）；若管理后台已有您的申请资料仍为空，请联系客服核对工单 #",
    dnsHeaderStandalone: "需要您在域名 DNS 后台添加的记录（完成步骤 2「生成 DNS」后显示）",
    dnsLeadStandalone: "请先在上方步骤 2 填写 VPS IP、完成装机，并点击「生成 DNS 记录」。生成后此处将显示通常 5 条记录（",
    dnsFootnoteWithDomain: (domain) =>
      `发件域名 ${domain}：生成 DNS 后请复制到域名服务商，再点「验证 DNS」。`,
    dnsFootnoteGeneric: "完成步骤 2 生成 DNS 后，请复制记录到域名服务商并验证。",
    dnsRecordsTitle: "需要您在域名 DNS 后台添加以下记录",
    copyAll: "一键复制全部记录",
    copiedAll: "✓ 已复制全部",
    verifyDns: "我已添加，验证 DNS",
    verifying: "验证中…",
    dnsVerifyAllOk: "✓ DNS 全部记录验证通过！可在下方发送测试邮件自检本域通道。",
    dnsVerifyPartial: "部分记录尚未生效，请确认 DNS 是否已添加并等待传播（通常 1–10 分钟）。",
    dnsPendingNewCycleBanner:
      "您已完成新套餐付款：请等待平台推送 DNS 后正式周期开始；推送后请添加记录并点击「验证 DNS」，通过后即可发送测试邮件。",
    dnsInstructionsLead:
      "请在下表逐条添加到域名 DNS 服务商（腾讯云 / 阿里云 / Cloudflare 等），等待 1–10 分钟后点击上方「验证 DNS」。",
    dnsTencentAliyunHint:
      "腾讯云 / 阿里云：「主机记录」只填下表第一列；面板会自动加上根域后缀。共 5 条：SPF、DKIM、DMARC、A（记录值填 PTR 机公网 IP）、MX（优先级 10，记录值只填邮件服务器主机名，勿带「10 」或「MX」前缀）。",
    thHost: "主机记录",
    thType: "类型",
    thMxPriority: "MX 优先级",
    thValue: "记录值",
    thRow: "整行",
    thVerify: "验证",
    fqdnHint: (fqdn, zone) => `完整：${fqdn}（面板会自动加 .${zone}）`,
    fullLabel: (fqdn) => `完整 ${fqdn}`,
    mxPriorityTitle: "仅复制优先级数字（如 10）",
    mxValueTitle: "仅复制邮件服务器主机名（不含 MX / 优先级）",
    aValueTitle: "复制 PTR 发信机公网 IP（IPv4）",
    selectRow: "全选本行",
    copyRow: "复制本行",
    verified: "✓ 已生效",
    notVerified: "未生效",
    testSendTitle: "发送测试邮件 —— 验证您的专属通道是否已开通",
    testReady: "可测试",
    testDisabledNoItem: "请先保存发信域名后再发送测试邮件。",
    testDisabledNoDns: "请先在步骤 2 生成 DNS 记录，并在步骤 3 验证通过后再测试。",
    testDisabledDns: "请先在步骤 3 验证全部 DNS 记录，再发送测试邮件。",
    testDisabledSmtp: "请先在步骤 2 完成 SMTP 同步与 587 验证，再发送测试邮件。",
    recipientPh: "测试收件邮箱（建议用您可以打开的私人邮箱，例 youraccount@gmail.com）",
    sendTest: "发送测试邮件",
    sending: "发送中…",
    testDelivered: "✓ 测试邮件已送达",
    testInboxHint: "收件人请检查收件箱（如未到达请查看垃圾箱，并把这封邮件标记为「非垃圾邮件」）。",
    testFailed: "✗ 测试未通过",
    copyFailure: "一键复制失败原因",
    copied: "✓ 已复制",
    testFailureFeedback: "请把上方失败原因复制后通过站内私信或联系平台客服反馈。",
    testFooter:
      "说明：测试邮件由您的独立 IP 通道发出；若顺利到达收件箱（不在垃圾箱），说明 PTR / SPF / DKIM / DMARC 全部配置就绪，您的专属通道已可正式投入营销活动使用。",
    testSuccessLine: (recipient, messageId) =>
      `✓ 已送达：测试邮件已成功发送到 ${recipient}${messageId ? `（messageId: ${messageId}）` : ""}`,
    testSuccessNote:
      "测试发送成功。本机为永久授权独立部署，专机通道已就绪，可前往「邮件营销」正式发信。",
    errNoRecipient: "请填写测试收件邮箱。",
    errRecipientFormat: "测试收件邮箱格式不正确。",
    errTimeout: "请求超时（约 95 秒）：后端仍未返回。请确认 backend 已启动，或查看后端终端是否有 SMTP 报错。",
    addDomainTitle: (index, lane) =>
      `新增发信域名（第 ${index} 个${lane != null ? ` · 专线 ${lane}` : ""}）`,
    addDomainDefaultLabel: (index) => `发信域名 ${index}`,
    addDomainSaved: "已提交新发信域名申请。请点上方该域名标签，在同一区域完成 DNS 验证与测试发信。",
    addDomainHint:
      "提交后请点上方新域名标签，在本区域下方完成 DNS 与测试（无需整页往下找）。",
    addDomainSmtpNote: "SMTP 发信密码由平台运营在后台生成并写入发信机，您无需填写。",
    addDomainDnsNote:
      "提交成功后，DNS 记录与「发送测试邮件」将出现在该域名的标签页内（与首域相同流程）。",
    cancel: "取消",
    dnsLeadRecordsSuffix: "）推送到这里。",
    dnsAwaitingExperienceTitle: "推送后的体验：",
    dnsAwaitingExperience1: "本区域将自动变成一张可复制的表格（主机记录 / 类型 / 值）",
    dnsAwaitingExperience2: "您只需复制粘贴到自己域名 DNS 服务商（腾讯云 / 阿里云 / Cloudflare 等）的解析后台",
    dnsAwaitingExperience3: "添加完点「验证 DNS」按钮，平台会自动校验",
    dnsAwaitingExperience4: "同步发您一条站内私信，避免您错过这个进度",
    quotaOverTitle: "发信域名超出当前套餐名额",
    quotaOverBody: (over, slots) =>
      `当前登记 ${over + slots} 个域，套餐仅 ${slots} 个名额。请先删除多余发信域或升级套餐后再发信。`,
    quotaOverFootnote:
      "续费且档位不变、或升级后名额仍够用：邮件营销与测试发信可照常使用。仅「换购较低档位」且登记域数多于新名额时需先删域。",
    dnsSelectAll: "全选",
    dnsCopyBtn: "复制",
    dnsCopiedBtn: "✓ 已复制",
    rejectedTitle: "以下发信域名申请未通过审核",
    rejectedDesc: "名额已释放。可「继续编辑」修改后重新等待审核，或「删除」移除此条回执。",
    rejectedReasonLabel: "驳回原因：",
    rejectedNoReason: "未提供具体原因，请联系客服。",
    rejectedProcessedAt: (time) => `处理时间：${time}`,
    rejectedContinueEdit: "继续编辑",
    rejectedBusy: "处理中…",
    rejectedDelete: "删除",
    rejectedDeleteConfirm: "删除后此驳回回执将不再显示，确定？",
    rejectedDeleteConfirmLabel: "确认删除",
    rejectedReopenOk: "已解锁编辑，请修改下方资料后点「保存修改」",
    rejectedRemoveOk: "已移除该驳回记录",
    testFailureClipboard: ({ item, recipient, reason, time }) =>
      [
        "【邮件营销服务开通 · 测试发送失败】",
        item ? `服务 ID：${item.id}` : "（未提交申请）",
        item?.label ? `服务名称：${item.label}` : "",
        item?.senderDomain ? `发件域名：${item.senderDomain}` : "",
        item?.fromEmail ? `发件邮箱：${item.fromEmail}` : "",
        `当前状态：${item?.status ?? "—"}`,
        `测试收件邮箱：${recipient.trim() || "（未填）"}`,
        "",
        "失败原因：",
        reason,
        "",
        `时间：${time}`
      ]
        .filter(Boolean)
        .join("\n")
  };
}
