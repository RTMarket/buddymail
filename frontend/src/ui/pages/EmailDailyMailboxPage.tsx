import React, { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { PageShell } from "../components/PageShell";
import { apiJson } from "../../lib/api";

/** 开源版：邮箱地址由后端 env 配置（DAILY_MAILBOX_ADDRESSES / STAFF_MAILBOX_ADDRESSES），前端从 accounts 接口动态加载 */
function boxKey(email: string): string {
  return email.replace(/[^a-z0-9]/g, "-") || "box";
}

type MailboxAccount = { email: string; staff?: boolean; name?: string; enName?: string };

type FolderKey = "inbox" | "starred" | "drafts" | "sent" | "trash" | "junk";

type MailItem = {
  uid: number;
  seq: number;
  date: string | null;
  from: string;
  to: string;
  cc?: string;
  subject: string;
  flagged: boolean;
  seen: boolean;
  folder: FolderKey;
  mailboxPath: string;
};

type InlineImg = { cid: string; name: string; dataUrl: string; width: number };
type AttachFile = { filename: string; contentType: string; contentBase64: string };

type FolderCount = { total: number; unread: number };

const EMPTY_COUNTS: Record<FolderKey, FolderCount> = {
  inbox: { total: 0, unread: 0 },
  starred: { total: 0, unread: 0 },
  drafts: { total: 0, unread: 0 },
  sent: { total: 0, unread: 0 },
  trash: { total: 0, unread: 0 },
  junk: { total: 0, unread: 0 }
};

function folderParen(c: FolderCount): string {
  return `(${c.total})`;
}

function dataUrlToB64(dataUrl: string): string {
  return dataUrl.split(",")[1] ?? "";
}

async function compressImage(file: File): Promise<{ dataUrl: string; name: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(new Error("图片读取失败"));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("图片无法解码"));
    i.src = dataUrl;
  });
  const max = 1200;
  const scale = Math.min(1, max / Math.max(img.width, 1));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { dataUrl, name: file.name || "image.jpg" };
  ctx.drawImage(img, 0, 0, w, h);
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.82), name: (file.name || "image").replace(/\.[^.]+$/, "") + ".jpg" };
}

async function fileToAttach(file: File): Promise<AttachFile> {
  if (file.size > 1_500_000) throw new Error(`附件过大：${file.name}（单文件请小于 1.5MB）`);
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return {
    filename: file.name || "file",
    contentType: file.type || "application/octet-stream",
    contentBase64: btoa(bin)
  };
}

const FOLDERS: Array<{ key: FolderKey; label: string }> = [
  { key: "inbox", label: "收件箱" },
  { key: "starred", label: "星标邮件" },
  { key: "drafts", label: "草稿箱" },
  { key: "sent", label: "已发送" },
  { key: "trash", label: "已删除" },
  { key: "junk", label: "垃圾邮箱" }
];

function Icon({ name, className }: { name: FolderKey | "compose" | "star"; className?: string }) {
  const cn = className ?? "h-4 w-4";
  const p = { className: cn, fill: "none", stroke: "currentColor", strokeWidth: 1.8, viewBox: "0 0 24 24" };
  if (name === "inbox") {
    return (
      <svg {...p}>
        <path d="M3 7.5 5.2 3.8A2 2 0 0 1 6.9 3h10.2a2 2 0 0 1 1.7.8L21 7.5v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-10Z" />
        <path d="M3 8h5.2a2 2 0 0 0 1.6.8h4.4a2 2 0 0 0 1.6-.8H21" />
      </svg>
    );
  }
  if (name === "starred" || name === "star") {
    return (
      <svg {...p} fill={name === "starred" ? "currentColor" : "none"}>
        <path d="m12 3.2 2.5 5.1 5.6.8-4 3.9.9 5.6L12 16.8 6.99 18.6l.9-5.6-4-3.9 5.6-.8L12 3.2Z" />
      </svg>
    );
  }
  if (name === "drafts") {
    return (
      <svg {...p}>
        <path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10A1.5 1.5 0 0 0 18.5 19V8.5L14 3.5Z" />
        <path d="M14 3.5V8.5h4.5M8.5 12.5h7M8.5 16h5" />
      </svg>
    );
  }
  if (name === "sent") {
    return (
      <svg {...p}>
        <path d="M4 12 20 4l-6.2 16-2.5-6.2L4 12Z" />
        <path d="m11.3 13.8 8.7-9.8" />
      </svg>
    );
  }
  if (name === "trash") {
    return (
      <svg {...p}>
        <path d="M5 7h14M10 7V5h4v2M8 7l.8 12.2A1.5 1.5 0 0 0 10.3 20.5h3.4a1.5 1.5 0 0 0 1.5-1.3L16 7" />
      </svg>
    );
  }
  if (name === "junk") {
    return (
      <svg {...p}>
        <path d="M12 4 3.8 18.5h16.4L12 4Z" />
        <path d="M12 10v4.5M12 17.2v.4" />
      </svg>
    );
  }
  return (
    <svg {...p}>
      <path d="M4 6.5h16v11H4v-11Z" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

export function EmailDailyMailboxPage() {
  const { box } = useParams();
  const [boxMap, setBoxMap] = useState<Record<string, string>>({});
  const [accountsReady, setAccountsReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await apiJson<{ ok: boolean; accounts?: MailboxAccount[] }>(
          "/api/email/daily-mailbox/accounts"
        );
        if (!cancelled && r.ok && Array.isArray(r.accounts)) {
          const m: Record<string, string> = {};
          for (const a of r.accounts) {
            if (a.email) m[boxKey(a.email)] = a.email;
          }
          setBoxMap(m);
        }
      } catch {
        /* keep empty */
      } finally {
        if (!cancelled) setAccountsReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const account = box ? boxMap[box] : undefined;
  const firstBox = Object.keys(boxMap)[0];
  const [folder, setFolder] = useState<FolderKey>("inbox");
  const [items, setItems] = useState<MailItem[]>([]);
  const [listMsg, setListMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<MailItem | null>(null);
  const [bodyText, setBodyText] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [inlineImgs, setInlineImgs] = useState<InlineImg[]>([]);
  const [attachFiles, setAttachFiles] = useState<AttachFile[]>([]);
  const [draftUid, setDraftUid] = useState<number | undefined>();
  const [sendMsg, setSendMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [counts, setCounts] = useState<Record<FolderKey, FolderCount>>(EMPTY_COUNTS);
  const bodyCache = useRef<Record<string, string>>({});
  const openGen = useRef(0);

  const loadCounts = useCallback(async (addr: string) => {
    try {
      const r = await apiJson<{ counts?: Record<FolderKey, FolderCount> }>(
        `/api/email/daily-mailbox/folder-counts?account=${encodeURIComponent(addr)}`
      );
      if (r.counts) {
        setCounts({ ...EMPTY_COUNTS, ...r.counts });
      }
    } catch {
      /* keep last counts */
    }
  }, []);

  const loadList = useCallback(
    async (addr: string, f: FolderKey) => {
      setLoading(true);
      setListMsg(null);
      try {
        const r = await apiJson<{ ok: boolean; items?: MailItem[]; count?: number; message?: string }>(
          `/api/email/daily-mailbox/messages?account=${encodeURIComponent(addr)}&folder=${f}`
        );
        const listed = (r.items ?? [])
          .slice()
          .sort((a, b) => (Date.parse(b.date ?? "") || 0) - (Date.parse(a.date ?? "") || 0));
        setItems(listed);
        setCounts((prev) => ({
          ...prev,
          [f]: {
            total: Math.max(Number(r.count ?? 0), listed.length, prev[f]?.total ?? 0),
            unread: listed.filter((x) => !x.seen).length
          }
        }));
        window.setTimeout(() => void loadCounts(addr), 1800);
      } catch (e: unknown) {
        setItems([]);
        setListMsg(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [loadCounts]
  );

  useEffect(() => {
    if (!account) return;
    setSelected(null);
    setBodyText("");
    setComposeOpen(false);
    setFolder("inbox");
    setTo("");
    setCc("");
    setSubject("");
    setText("");
    setInlineImgs([]);
    setAttachFiles([]);
    setDraftUid(undefined);
    setSendMsg(null);
    setCounts(EMPTY_COUNTS);
    setItems([]);
  }, [account]);

  useEffect(() => {
    if (!account) return;
    setSelected(null);
    setBodyText("");
    void loadList(account, folder);
  }, [account, folder, loadList]);

  async function openMail(item: MailItem) {
    if (!account) return;
    const gen = ++openGen.current;
    const ck = `${item.mailboxPath}:${item.uid}`;
    setSelected(item);
    setSendMsg(null);
    if (folder === "drafts") {
      setComposeOpen(true);
      setTo(item.to.replace(/.*<([^>]+)>.*/, "$1") || item.to);
      setSubject(item.subject === "(无主题)" ? "" : item.subject);
      setDraftUid(item.uid);
    } else {
      setComposeOpen(false);
    }
    const cached = bodyCache.current[ck];
    const cacheOk = Boolean(cached) && !/This is a multi-part|------=_NextPart|Content-Transfer-Encoding:\s*base64/i.test(cached);
    setBodyText(cacheOk ? cached : "正在载入正文…");
    if (folder === "drafts" && cacheOk) setText(cached);
    try {
      const r = await apiJson<{ text?: string; item?: MailItem }>(
        `/api/email/daily-mailbox/message?account=${encodeURIComponent(account)}&uid=${item.uid}&folder=${folder}&mailboxPath=${encodeURIComponent(item.mailboxPath)}`
      );
      if (gen !== openGen.current) return;
      const text = r.text ?? "";
      if (text && !/This is a multi-part|------=_NextPart/i.test(text)) bodyCache.current[ck] = text;
      setBodyText(text);
      if (r.item) {
        setSelected({ ...item, ...r.item, folder: item.folder, mailboxPath: item.mailboxPath || r.item.mailboxPath });
        setItems((prev) =>
          prev.map((x) =>
            x.uid === item.uid && x.mailboxPath === item.mailboxPath ? { ...x, ...r.item, folder: x.folder } : x
          )
        );
      }
      if (folder === "drafts") setText(text);
      if (!item.seen) {
        setItems((prev) =>
          prev.map((x) =>
            x.uid === item.uid && x.mailboxPath === item.mailboxPath ? { ...x, seen: true } : x
          )
        );
        setSelected((cur) => (cur && cur.uid === item.uid ? { ...cur, seen: true } : cur));
      }
    } catch (e: unknown) {
      if (gen !== openGen.current) return;
      if (!cached) setBodyText(e instanceof Error ? e.message : String(e));
    }
  }

  async function act(path: string, payload: object, nextFolder?: FolderKey) {
    if (!account) return;
    setBusy(true);
    setSendMsg(null);
    try {
      await apiJson(path, { method: "POST", body: JSON.stringify({ account, ...payload }) });
      setSelected(null);
      setBodyText("");
      await loadList(account, nextFolder ?? folder);
    } catch (e: unknown) {
      setSendMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!accountsReady) {
    return (
      <PageShell title="企业邮箱">
        <div className="p-6 text-sm text-slate-500">加载中...</div>
      </PageShell>
    );
  }
  if (!account) {
    if (firstBox) {
      return <Navigate to={`/email/daily-mailbox/${firstBox}`} replace />;
    }
    return (
      <PageShell title="企业邮箱">
        <div className="p-6 text-sm text-slate-500">
          尚未配置企业邮箱。请在服务器 .env 中设置 DAILY_MAILBOX_ADDRESSES（逗号分隔），重启后端后刷新本页。
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title={account}
      actions={
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white"
          onClick={() => {
            setComposeOpen(true);
            setSelected(null);
            setDraftUid(undefined);
            setTo("");
            setCc("");
            setSubject("");
            setText("");
            setInlineImgs([]);
            setAttachFiles([]);
            setSendMsg(null);
          }}
        >
          <Icon name="compose" className="h-4 w-4" />
          写邮件
        </button>
      }
    >
      <div className="mt-1 flex min-h-[calc(100vh-10.5rem)] overflow-hidden rounded-xl border border-slate-200 bg-white">
        <nav className="w-52 shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50 py-3">
          {FOLDERS.map((f) => {
            const active = folder === f.key && !composeOpen;
            const c = counts[f.key];
            const unreadish = f.key === "inbox" || f.key === "starred" ? c.unread > 0 : false;
            return (
              <button
                key={f.key}
                type="button"
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm ${
                  active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
                }`}
                onClick={() => {
                  setComposeOpen(false);
                  setFolder(f.key);
                }}
              >
                <Icon name={f.key} className="h-4 w-4 shrink-0" />
                <span className={`min-w-0 flex-1 truncate ${unreadish && !active ? "font-semibold" : ""}`}>
                  {f.label}
                </span>
                <span
                  className={`shrink-0 text-xs ${
                    active ? "text-white/80" : unreadish ? "font-semibold text-sky-700" : "text-slate-400"
                  }`}
                >
                  {folderParen(c)}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="flex min-h-0 min-w-0 flex-1">
          <div className="flex w-[22rem] shrink-0 flex-col border-r border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
              <span className="text-sm font-medium text-slate-800">
                {composeOpen ? "写信" : FOLDERS.find((x) => x.key === folder)?.label}
              </span>
              <button
                type="button"
                className="text-xs text-slate-500 hover:text-slate-800"
                onClick={() => void loadList(account, folder)}
                disabled={loading}
              >
                {loading ? "刷新中…" : "刷新"}
              </button>
            </div>
            {listMsg ? <p className="px-3 py-2 text-xs text-rose-700">{listMsg}</p> : null}
            <ul className="min-h-0 flex-1 overflow-y-auto [max-height:min(100%,calc(25*4.85rem))]">
              {items.length === 0 && !loading && !listMsg ? (
                <li className="px-3 py-6 text-xs text-slate-500">这个文件夹是空的。</li>
              ) : (
                items.map((m) => {
                  const on = selected?.uid === m.uid && selected?.mailboxPath === m.mailboxPath;
                  return (
                    <li key={`${m.mailboxPath}-${m.uid}`}>
                      <button
                        type="button"
                        className={`w-full border-b border-slate-50 px-3 py-2.5 text-left ${
                          on ? "bg-sky-50" : "hover:bg-slate-50"
                        }`}
                        onClick={() => void openMail(m)}
                      >
                        <div className="flex items-start gap-2">
                          <span
                            className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                              m.seen ? "border border-slate-300 bg-white" : "bg-sky-600"
                            }`}
                            title={m.seen ? "已读" : "未读"}
                          />
                          {m.flagged ? (
                            <span className="mt-0.5 text-amber-500">
                              <Icon name="star" className="h-3.5 w-3.5" />
                            </span>
                          ) : null}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`rounded px-1 py-px text-[10px] ${
                                  m.seen ? "bg-slate-100 text-slate-500" : "bg-sky-100 font-semibold text-sky-800"
                                }`}
                              >
                                {m.seen ? "已读" : "未读"}
                              </span>
                              <div
                                className={`min-w-0 truncate text-sm ${
                                  m.seen ? "font-normal text-slate-700" : "font-semibold text-slate-900"
                                }`}
                              >
                                {m.subject}
                              </div>
                            </div>
                            <div className="truncate text-xs text-slate-500">{folder === "sent" ? m.to : m.from}</div>
                            <div className="text-[11px] text-slate-400">
                              {m.date ? new Date(m.date).toLocaleString() : ""}
                            </div>
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-4">
            {composeOpen ? (
              <div className="flex min-h-full flex-col">
                <p className="mb-2 text-xs text-slate-500">发件人：{account}</p>
                <label className="block text-xs text-slate-600">收件人</label>
                <input
                  type="email"
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="对方邮箱"
                />
                <label className="mt-3 block text-xs text-slate-600">抄送</label>
                <input
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  placeholder="可填多个，用逗号分隔"
                />
                <label className="mt-3 block text-xs text-slate-600">主题</label>
                <input
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
                <label className="mt-3 block text-xs text-slate-600">正文</label>
                <textarea
                  className="mt-1 min-h-[22rem] w-full flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="在这里写邮件内容…"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <label className="cursor-pointer rounded-md border border-slate-200 px-3 py-1.5 text-xs">
                    插入图片
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file) return;
                        try {
                          const img = await compressImage(file);
                          setInlineImgs((prev) => [
                            ...prev,
                            {
                              cid: `img${Date.now()}`,
                              name: img.name,
                              dataUrl: img.dataUrl,
                              width: 360
                            }
                          ]);
                        } catch (err: unknown) {
                          setSendMsg(err instanceof Error ? err.message : String(err));
                        }
                      }}
                    />
                  </label>
                  <label className="cursor-pointer rounded-md border border-slate-200 px-3 py-1.5 text-xs">
                    添加附件
                    <input
                      type="file"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file) return;
                        try {
                          const a = await fileToAttach(file);
                          setAttachFiles((prev) => [...prev, a]);
                        } catch (err: unknown) {
                          setSendMsg(err instanceof Error ? err.message : String(err));
                        }
                      }}
                    />
                  </label>
                </div>
                {inlineImgs.length ? (
                  <div className="mt-3 space-y-3">
                    {inlineImgs.map((im) => (
                      <div key={im.cid} className="rounded-md border border-slate-100 bg-slate-50 p-2">
                        <img src={im.dataUrl} alt="" style={{ width: im.width, maxWidth: "100%", height: "auto" }} />
                        <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                          <span>图片宽度 {im.width}px</span>
                          <input
                            type="range"
                            min={120}
                            max={720}
                            value={im.width}
                            onChange={(e) => {
                              const width = Number(e.target.value);
                              setInlineImgs((prev) => prev.map((x) => (x.cid === im.cid ? { ...x, width } : x)));
                            }}
                          />
                          <button
                            type="button"
                            className="text-rose-600"
                            onClick={() => setInlineImgs((prev) => prev.filter((x) => x.cid !== im.cid))}
                          >
                            移除
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
                {attachFiles.length ? (
                  <ul className="mt-2 space-y-1 text-xs text-slate-600">
                    {attachFiles.map((a) => (
                      <li key={a.filename} className="flex justify-between gap-2">
                        <span className="truncate">附件：{a.filename}</span>
                        <button
                          type="button"
                          className="text-rose-600"
                          onClick={() => setAttachFiles((prev) => prev.filter((x) => x !== a))}
                        >
                          移除
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {sendMsg ? (
                  <p className={`mt-2 text-xs ${sendMsg.startsWith("已") ? "text-emerald-700" : "text-rose-700"}`}>
                    {sendMsg}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
                    onClick={async () => {
                      setBusy(true);
                      setSendMsg(null);
                      try {
                        await apiJson("/api/email/daily-mailbox/send", {
                          method: "POST",
                          body: JSON.stringify({
                            from: account,
                            to: to.trim(),
                            cc,
                            subject: subject.trim(),
                            text: text.trim(),
                            draftUid,
                            attachments: [
                              ...inlineImgs.map((im) => ({
                                filename: im.name,
                                contentType: "image/jpeg",
                                contentBase64: dataUrlToB64(im.dataUrl),
                                cid: im.cid,
                                inline: true,
                                width: im.width
                              })),
                              ...attachFiles
                            ]
                          })
                        });
                        setSendMsg("已发送，可在「已发送」里查看。");
                        setText("");
                        setCc("");
                        setInlineImgs([]);
                        setAttachFiles([]);
                        setDraftUid(undefined);
                        setFolder("sent");
                        setComposeOpen(false);
                      } catch (e: unknown) {
                        setSendMsg(e instanceof Error ? e.message : String(e));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {busy ? "处理中…" : "发送"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-md border border-slate-200 px-4 py-2 text-sm disabled:opacity-50"
                    onClick={async () => {
                      setBusy(true);
                      setSendMsg(null);
                      try {
                        await apiJson("/api/email/daily-mailbox/draft", {
                          method: "POST",
                          body: JSON.stringify({
                            from: account,
                            to: to.trim(),
                            cc,
                            subject: subject.trim(),
                            text: text.trim(),
                            attachments: [
                              ...inlineImgs.map((im) => ({
                                filename: im.name,
                                contentType: "image/jpeg",
                                contentBase64: dataUrlToB64(im.dataUrl),
                                cid: im.cid,
                                inline: true,
                                width: im.width
                              })),
                              ...attachFiles
                            ]
                          })
                        });
                        setSendMsg("已存入草稿箱。");
                        setFolder("drafts");
                        setComposeOpen(false);
                      } catch (e: unknown) {
                        setSendMsg(e instanceof Error ? e.message : String(e));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    存草稿
                  </button>
                </div>
              </div>
            ) : selected ? (
              <div>
                <div className="mb-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-wide text-slate-400">标题栏</div>
                  <h2 className="mt-1 text-lg font-semibold text-slate-900">{selected.subject}</h2>
                  <div className="mt-2 grid gap-1 text-sm text-slate-700">
                    <div>
                      <span className="inline-block w-14 text-slate-500">发件人</span>
                      {selected.from || "（无）"}
                    </div>
                    <div>
                      <span className="inline-block w-14 text-slate-500">收件人</span>
                      {selected.to || account}
                    </div>
                    {selected.cc ? (
                      <div>
                        <span className="inline-block w-14 text-slate-500">抄送</span>
                        {selected.cc}
                      </div>
                    ) : null}
                    <div>
                      <span className="inline-block w-14 text-slate-500">时间</span>
                      {selected.date ? new Date(selected.date).toLocaleString() : ""}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs"
                    onClick={() =>
                      void act("/api/email/daily-mailbox/flag", {
                        uid: selected.uid,
                        mailboxPath: selected.mailboxPath,
                        folder,
                        starred: !selected.flagged
                      })
                    }
                  >
                    <Icon name="star" className="h-3.5 w-3.5 text-amber-500" />
                    {selected.flagged ? "取消星标" : "标为星标"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-md border border-slate-200 px-2.5 py-1 text-xs"
                    onClick={() =>
                      void act("/api/email/daily-mailbox/flag", {
                        uid: selected.uid,
                        mailboxPath: selected.mailboxPath,
                        folder,
                        seen: !selected.seen
                      })
                    }
                  >
                    {selected.seen ? "标为未读" : "标为已读"}
                  </button>
                  {folder !== "junk" ? (
                    <button
                      type="button"
                      disabled={busy}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs"
                      onClick={() =>
                        void act(
                          "/api/email/daily-mailbox/move",
                          { uid: selected.uid, mailboxPath: selected.mailboxPath, folder, dest: "junk" },
                          "junk"
                        )
                      }
                    >
                      <Icon name="junk" className="h-3.5 w-3.5" />
                      标为垃圾
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-md border border-slate-200 px-2.5 py-1 text-xs"
                      onClick={() =>
                        void act(
                          "/api/email/daily-mailbox/move",
                          { uid: selected.uid, mailboxPath: selected.mailboxPath, folder, dest: "inbox" },
                          "inbox"
                        )
                      }
                    >
                      移回收件箱
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-2.5 py-1 text-xs text-rose-700"
                    onClick={() =>
                      void act("/api/email/daily-mailbox/delete", {
                        uid: selected.uid,
                        mailboxPath: selected.mailboxPath,
                        folder
                      })
                    }
                  >
                    <Icon name="trash" className="h-3.5 w-3.5" />
                    {folder === "trash" ? "永久删除" : "删除"}
                  </button>
                </div>
                {sendMsg ? <p className="mt-2 text-xs text-rose-700">{sendMsg}</p> : null}
                <pre className="mt-4 whitespace-pre-wrap break-words rounded-md bg-slate-50 p-3 text-sm text-slate-800">
                  {bodyText || "（无正文）"}
                </pre>
              </div>
            ) : (
              <p className="text-sm text-slate-500">从左侧文件夹点开一封邮件，或点右上角写邮件。</p>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}

export default EmailDailyMailboxPage;
