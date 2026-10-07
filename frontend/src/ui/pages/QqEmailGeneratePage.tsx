import React, { useEffect, useRef, useState } from "react";
import { PageShell } from "../components/PageShell";
import { SectionCard } from "../components/SectionCard";
import { apiJson, apiJsonWithTimeout } from "../../lib/api";
import {
  QQ_DIGIT_OPTIONS,
  QQ_GENERATE_COUNT_OPTIONS,
  downloadTextFile,
  dripIntervalMs,
  emailsToCsv,
  generateUniqueQqEmails,
  type QqDigitLength,
  type QqGenerateCount
} from "../../lib/qqEmailGenerate";
import {
  clearQqEmailGenerateState,
  loadQqEmailGenerateState,
  saveQqEmailGenerateState,
  type QqVerifyStatusStored
} from "../../lib/qqEmailGenerateStorage";

type GenPhase = "idle" | "running" | "done";
type VerifyPhase = "idle" | "running" | "done" | "error";

type VerifyCapability = {
  ok: boolean;
  configured: boolean;
  provider?: string | null;
  relayIp?: string;
  maxBatch?: number;
  message?: string;
};

type VerifyBatchResp = {
  ok: boolean;
  total: number;
  validCount: number;
  invalidCount: number;
  unverifiedCount: number;
  valid: string[];
  results?: Array<{ email: string; status: string }>;
  message?: string;
};

function countsFromMap(map: Record<string, QqVerifyStatusStored>) {
  let valid = 0;
  let invalid = 0;
  let unverified = 0;
  for (const st of Object.values(map)) {
    if (st === "valid") valid += 1;
    else if (st === "invalid") invalid += 1;
    else unverified += 1;
  }
  return { valid, invalid, unverified };
}

/** 独立站 · 生成数字 QQ 邮箱 + 经装机发信机检验有效性（localStorage 持久化） */
export function QqEmailGeneratePage() {
  const restoredRef = useRef(loadQqEmailGenerateState());
  const restored = restoredRef.current;

  const [digits, setDigits] = useState<QqDigitLength>(restored?.digits ?? 10);
  const [count, setCount] = useState<QqGenerateCount>(restored?.count ?? 50);
  const [phase, setPhase] = useState<GenPhase>(restored?.generated.length ? "done" : "idle");
  const [stream, setStream] = useState<string[]>(restored?.generated ?? []);
  const [generated, setGenerated] = useState<string[]>(restored?.generated ?? []);
  const [validEmails, setValidEmails] = useState<string[]>(restored?.validEmails ?? []);
  const [showValidOnly, setShowValidOnly] = useState(Boolean(restored?.showValidOnly));
  const [progress, setProgress] = useState(restored?.generated.length ?? 0);
  const [verifyPhase, setVerifyPhase] = useState<VerifyPhase>(() => {
    if (!restored?.generated.length) return "idle";
    const done = Object.keys(restored.verifyByEmail).length;
    if (done > 0 && done >= restored.generated.length) return "done";
    if (done > 0) return "idle";
    return restored.showValidOnly ? "done" : "idle";
  });
  const [verifyProgress, setVerifyProgress] = useState(
    restored?.verifyProgress ?? { done: 0, total: 0 }
  );
  const [validCount, setValidCount] = useState(restored?.validCount ?? 0);
  const [invalidCount, setInvalidCount] = useState(restored?.invalidCount ?? 0);
  const [unverifiedCount, setUnverifiedCount] = useState(restored?.unverifiedCount ?? 0);
  const [verifyMsg, setVerifyMsg] = useState<string | null>(() => {
    if (!restored?.generated.length) return null;
    const done = Object.keys(restored.verifyByEmail).length;
    if (done > 0 && done < restored.generated.length) {
      return `已从本地恢复：名单 ${restored.generated.length} 条，已检验 ${done} 条。可继续点「检验」补完剩余。`;
    }
    if (restored.verifyMsg) return restored.verifyMsg;
    if (restored.generated.length) return `已从本地恢复 ${restored.generated.length} 条生成结果。`;
    return null;
  });
  const [verifyByEmail, setVerifyByEmail] = useState<Record<string, QqVerifyStatusStored>>(
    restored?.verifyByEmail ?? {}
  );
  const [capability, setCapability] = useState<VerifyCapability | null>(null);
  const cancelRef = useRef(false);
  const verifyCancelRef = useRef(false);
  const listEndRef = useRef<HTMLDivElement | null>(null);
  const verifyByEmailRef = useRef(verifyByEmail);
  verifyByEmailRef.current = verifyByEmail;

  const theory = QQ_DIGIT_OPTIONS.find((o) => o.digits === digits);
  const showingValid =
    showValidOnly || verifyPhase === "running" || verifyPhase === "done";
  const csvEmails = showingValid ? validEmails : generated;
  /** 每次验 1 个，有效/无效个数边验边涨 */
  /** 与后端 MAX_BATCH 对齐：一批少 SSH，进度按批刷新 */
  const maxBatch = 20;

  useEffect(() => {
    return () => {
      cancelRef.current = true;
      verifyCancelRef.current = true;
    };
  }, []);

  useEffect(() => {
    if (phase !== "running") return;
    listEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [stream, phase]);

  useEffect(() => {
    saveQqEmailGenerateState({
      digits,
      count,
      generated,
      validEmails,
      showValidOnly,
      validCount,
      invalidCount,
      unverifiedCount,
      verifyMsg,
      verifyProgress,
      verifyByEmail
    });
  }, [
    digits,
    count,
    generated,
    validEmails,
    showValidOnly,
    validCount,
    invalidCount,
    unverifiedCount,
    verifyMsg,
    verifyProgress,
    verifyByEmail
  ]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r = await apiJson<VerifyCapability>("/api/tools/qq-emails/verify-capability");
        if (alive) setCapability(r);
      } catch (e) {
        if (alive) {
          setCapability({
            ok: false,
            configured: false,
            message: e instanceof Error ? e.message : "无法读取检验能力"
          });
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function runGenerate() {
    if (phase === "running" || verifyPhase === "running") return;
    cancelRef.current = false;
    setPhase("running");
    setStream([]);
    setGenerated([]);
    setValidEmails([]);
    setShowValidOnly(false);
    setProgress(0);
    setVerifyPhase("idle");
    setValidCount(0);
    setInvalidCount(0);
    setUnverifiedCount(0);
    setVerifyMsg(null);
    setVerifyProgress({ done: 0, total: 0 });
    setVerifyByEmail({});

    const batch = generateUniqueQqEmails(digits, count);
    const delay = dripIntervalMs(batch.length);
    const revealed: string[] = [];

    for (let i = 0; i < batch.length; i += 1) {
      if (cancelRef.current) break;
      revealed.push(batch[i]!);
      setStream([...revealed]);
      setProgress(revealed.length);
      if (delay > 0) {
        await new Promise<void>((r) => window.setTimeout(r, delay));
      }
    }

    if (!cancelRef.current) {
      setGenerated([...revealed]);
      setPhase("done");
    } else {
      setGenerated([]);
      setPhase("idle");
    }
  }

  function clearAll() {
    cancelRef.current = true;
    verifyCancelRef.current = true;
    clearQqEmailGenerateState();
    setPhase("idle");
    setVerifyPhase("idle");
    setStream([]);
    setGenerated([]);
    setValidEmails([]);
    setShowValidOnly(false);
    setProgress(0);
    setValidCount(0);
    setInvalidCount(0);
    setUnverifiedCount(0);
    setVerifyMsg(null);
    setVerifyProgress({ done: 0, total: 0 });
    setVerifyByEmail({});
  }

  async function runVerify() {
    if (verifyPhase === "running" || phase === "running") return;
    if (!generated.length) {
      setVerifyMsg("请先生成邮箱");
      setVerifyPhase("error");
      return;
    }
    if (capability && !capability.configured) {
      setVerifyMsg(capability.message || "装机发信机未就绪");
      setVerifyPhase("error");
      return;
    }

    verifyCancelRef.current = false;
    setVerifyPhase("running");

    const all = [...generated];
    const map: Record<string, QqVerifyStatusStored> = { ...verifyByEmailRef.current };
    const pending = all.filter((em) => !map[em]);
    const base = countsFromMap(map);
    let validAcc = all.filter((em) => map[em] === "valid");
    let invalidAcc = base.invalid;
    let unverifiedAcc = base.unverified;
    const already = all.length - pending.length;

    setValidEmails([...validAcc]);
    setValidCount(validAcc.length);
    setInvalidCount(invalidAcc);
    setUnverifiedCount(unverifiedAcc);
    setShowValidOnly(true);
    setVerifyProgress({ done: already, total: all.length });

    if (!pending.length) {
      setVerifyPhase("done");
      setVerifyMsg(
        `检验完成：有效 ${validAcc.length} · 无效 ${invalidAcc} · 未知 ${unverifiedAcc}` +
          (capability?.relayIp ? `（经发信机 ${capability.relayIp}）` : "")
      );
      return;
    }

    setVerifyMsg(
      already > 0
        ? `继续检验剩余 ${pending.length} 个（已完成 ${already}/${all.length}）…`
        : `开始检验 ${pending.length} 个…`
    );

    try {
      for (let pi = 0; pi < pending.length; pi += maxBatch) {
        if (verifyCancelRef.current) break;
        const chunk = pending.slice(pi, pi + maxBatch);
        const globalDone = already + pi;
        setVerifyProgress({ done: globalDone, total: all.length });
        setVerifyMsg(
          `正在检验 ${globalDone + 1}–${Math.min(globalDone + chunk.length, all.length)}/${all.length}… 有效 ${validAcc.length} · 无效 ${invalidAcc}`
        );
        const r = await apiJsonWithTimeout<VerifyBatchResp>(
          "/api/tools/qq-emails/verify",
          {
            method: "POST",
            body: JSON.stringify({ emails: chunk })
          },
          180_000
        );
        if (!r.ok) {
          throw new Error(r.message || "检验失败");
        }
        const byEmail = new Map(
          (r.results || []).map((x) => [String(x.email || "").trim().toLowerCase(), x] as const)
        );
        for (const email of chunk) {
          const hit = byEmail.get(email.toLowerCase());
          const stRaw = String(
            hit?.status ?? (r.valid?.includes(email) ? "valid" : hit ? "invalid" : "unverified")
          );
          const st: QqVerifyStatusStored =
            stRaw === "valid" ? "valid" : stRaw === "invalid" ? "invalid" : "unverified";
          map[email] = st;
          if (st === "valid") {
            validAcc = [...validAcc, email];
          } else if (st === "invalid") {
            invalidAcc += 1;
          } else {
            unverifiedAcc += 1;
          }
        }
        const done = already + pi + chunk.length;
        setVerifyByEmail({ ...map });
        setValidEmails([...validAcc]);
        setValidCount(validAcc.length);
        setInvalidCount(invalidAcc);
        setUnverifiedCount(unverifiedAcc);
        setVerifyProgress({ done, total: all.length });
        setVerifyMsg(`已检验 ${done}/${all.length} · 有效 ${validAcc.length} · 无效 ${invalidAcc}`);
      }

      if (verifyCancelRef.current) {
        setVerifyPhase("idle");
        setVerifyMsg(
          `检验已暂停并已保存：${Object.keys(map).length}/${all.length}。可再点「检验」继续。`
        );
        return;
      }
      setShowValidOnly(true);
      setVerifyPhase("done");
      setVerifyMsg(
        `检验完成：有效 ${validAcc.length} · 无效 ${invalidAcc} · 未知 ${unverifiedAcc}` +
          (capability?.relayIp ? `（经发信机 ${capability.relayIp}）` : "")
      );
    } catch (e) {
      setVerifyByEmail({ ...map });
      setVerifyPhase("error");
      setVerifyMsg(
        `${e instanceof Error ? e.message : "检验失败"}（进度已保存，可再点检验继续）`
      );
    }
  }

  function onDownload() {
    const list = showingValid ? validEmails : generated;
    if (!list.length) return;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const prefix = showingValid ? "qq-valid" : "qq";
    downloadTextFile(`${prefix}-${digits}digit-${list.length}-${stamp}.csv`, emailsToCsv(list));
  }

  return (
    <PageShell
      title="生成邮箱"
      description="随机生成数字@qq.com；检验走装机发信 IP。名单与检验进度保存在本机浏览器（换页/刷新可恢复；点「删除」才清空）。"
    >
      <SectionCard title="生成参数">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-sm font-medium text-slate-800">位数（@qq.com）</div>
            <div className="mt-2 space-y-2">
              {QQ_DIGIT_OPTIONS.map((opt) => {
                const active = digits === opt.digits;
                return (
                  <label
                    key={opt.digits}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm ${
                      active ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <input
                      type="radio"
                      className="mt-1"
                      name="qq-digits"
                      checked={active}
                      disabled={phase === "running" || verifyPhase === "running"}
                      onChange={() => setDigits(opt.digits)}
                    />
                    <span>
                      <span className="font-medium text-slate-900">{opt.digits} 位数</span>
                      <span className="mt-0.5 block text-xs text-slate-600">
                        理论邮箱空间：{opt.theoryLabelZh}
                        <span className="ml-1 text-slate-400">
                          （{opt.theoryCount.toLocaleString("zh-CN")}）
                        </span>
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
            {theory ? (
              <p className="mt-2 text-xs text-slate-500">
                当前选择：{digits} 位 · 理论 {theory.theoryLabelZh} 个数字@qq.com
              </p>
            ) : null}
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-800" htmlFor="qq-gen-count">
                本次生成数量
              </label>
              <select
                id="qq-gen-count"
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                value={count}
                disabled={phase === "running" || verifyPhase === "running"}
                onChange={(e) => setCount(Number(e.target.value) as QqGenerateCount)}
              >
                {QQ_GENERATE_COUNT_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n} 个
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                disabled={phase === "running" || verifyPhase === "running"}
                onClick={() => void runGenerate()}
              >
                {phase === "running" ? `生成中… ${progress}/${count}` : "开始生成"}
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                disabled={phase === "idle" && !stream.length && !generated.length}
                onClick={clearAll}
              >
                停止 / 清空
              </button>
            </div>
            <p className="text-xs text-slate-500">
              随机组合、批次内不重复。结果会写入本机浏览器；换页再回来仍在。建议同时下载 CSV 备份。
            </p>
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="生成过程"
          description={
            phase === "running"
              ? `正在逐条生成… ${progress} / ${count}`
              : stream.length
                ? `已生成 ${stream.length} 条（列表约 50 行可视，其余滚动查看）`
                : "点击「开始生成」后在此逐条显示"
          }
        >
          <div className="h-[min(28rem,50vh)] overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 font-mono text-xs leading-6 text-slate-800">
            {stream.length === 0 ? (
              <div className="py-8 text-center text-slate-400">尚无输出</div>
            ) : (
              <ol className="list-decimal pl-5">
                {stream.map((email, idx) => (
                  <li key={`${email}-${idx}`} className="break-all">
                    {email}
                  </li>
                ))}
              </ol>
            )}
            <div ref={listEndRef} />
          </div>
        </SectionCard>

        <SectionCard
          title="CSV 表格"
          description={
            showingValid
              ? `有效邮箱 ${validEmails.length} 条（检验中/后仅展示有效）`
              : csvEmails.length
                ? `共 ${csvEmails.length} 行（检验后将只保留有效）`
                : "生成完成后在此预览；检验后只显示有效邮箱"
          }
          right={
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
                disabled={!csvEmails.length || phase === "running" || verifyPhase === "running"}
                onClick={onDownload}
              >
                {showingValid ? "下载有效邮箱 CSV" : "下载 CSV"}
              </button>
              <button
                type="button"
                className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                disabled={!csvEmails.length && !stream.length}
                onClick={clearAll}
              >
                删除
              </button>
            </div>
          }
        >
          <div className="h-[min(28rem,50vh)] overflow-auto rounded-lg border border-slate-200">
            {!csvEmails.length ? (
              <div className="flex h-full items-center justify-center py-8 text-sm text-slate-400">
                {phase === "running"
                  ? "生成完成后显示 CSV…"
                  : verifyPhase === "running"
                    ? "检验中，有效邮箱将陆续出现…"
                    : "暂无 CSV"}
              </div>
            ) : (
              <table className="min-w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 bg-slate-100 text-slate-700">
                  <tr>
                    <th className="border-b border-slate-200 px-3 py-2 font-semibold">#</th>
                    <th className="border-b border-slate-200 px-3 py-2 font-semibold">email</th>
                  </tr>
                </thead>
                <tbody>
                  {csvEmails.map((email, idx) => (
                    <tr key={`${email}-csv-${idx}`} className="odd:bg-white even:bg-slate-50/60">
                      <td className="border-b border-slate-100 px-3 py-1.5 text-slate-500">{idx + 1}</td>
                      <td className="border-b border-slate-100 px-3 py-1.5 font-mono text-slate-800">{email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="检验邮箱有效性"
        description={
          capability?.configured
            ? capability.message
            : capability?.message || "读取装机发信机配置中…"
        }
        right={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-50"
              disabled={
                !generated.length ||
                phase === "running" ||
                verifyPhase === "running" ||
                capability?.configured === false
              }
              onClick={() => void runVerify()}
            >
              {verifyPhase === "running"
                ? `检验中… ${verifyProgress.done}/${verifyProgress.total}`
                : "点击检验"}
            </button>
            {verifyPhase === "running" ? (
              <button
                type="button"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                onClick={() => {
                  verifyCancelRef.current = true;
                }}
              >
                停止检验
              </button>
            ) : null}
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3">
            <div className="text-xs text-emerald-800">有效个数</div>
            <div className="mt-1 text-2xl font-semibold text-emerald-900">{validCount}</div>
          </div>
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-3">
            <div className="text-xs text-rose-800">无效个数</div>
            <div className="mt-1 text-2xl font-semibold text-rose-900">{invalidCount}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="text-xs text-slate-600">未知 / 失败</div>
            <div className="mt-1 text-2xl font-semibold text-slate-800">{unverifiedCount}</div>
          </div>
        </div>
        {verifyMsg ? (
          <p
            className={`mt-3 text-sm ${
              verifyPhase === "error" ? "text-rose-700" : "text-slate-700"
            }`}
          >
            {verifyMsg}
          </p>
        ) : (
          <p className="mt-3 text-xs text-slate-500">
            检验完成后，右侧 CSV 只保留有效邮箱，并可「下载有效邮箱 CSV」。大批量请分批，避免发信 IP 被 QQ 限流。
          </p>
        )}
      </SectionCard>
    </PageShell>
  );
}
