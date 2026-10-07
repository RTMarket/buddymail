import React, { useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { clsx } from "clsx";
import { useAuth } from "../../auth/AuthContext";
import { BrandLogo } from "../components/BrandLogo";
import { SiteLanguageSwitcher } from "../components/SiteLanguageSwitcher";
import { useSiteLocale } from "../../i18n/SiteLocaleContext";
import { getGateStrings } from "../../i18n/gateI18n";

export function GatePage() {
  const { user, login } = useAuth();
  const { locale } = useSiteLocale();
  const copy = useMemo(() => getGateStrings(locale), [locale]);
  const navigate = useNavigate();
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) {
    return <Navigate to="/email/campaigns" replace />;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const acct = account.trim();
    if (!acct) {
      setError(copy.errAccountFormat);
      return;
    }
    if (!password) {
      setError(copy.errPasswordRequired);
      return;
    }
    setSubmitting(true);
    const r = await login(acct, password);
    if (!r.ok) {
      setError(r.message);
      setSubmitting(false);
      return;
    }
    navigate("/email/campaigns", { replace: true });
    setSubmitting(false);
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-sky-50">
      <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col overflow-x-clip lg:flex-row lg:items-stretch">
        <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-8 pb-10 pt-6 sm:px-10 lg:min-h-screen lg:px-12 lg:pb-14 lg:pt-14">
          <div className="relative mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col justify-center overflow-hidden py-4 lg:max-w-xl lg:min-h-0 lg:flex-1 lg:py-6">
            <div className="flex flex-col items-center gap-6 text-center lg:gap-7">
              <div className="flex w-full shrink-0 justify-center">
                <BrandLogo
                  variant="gate"
                  className="mx-auto max-h-[min(17rem,32vh)] object-contain object-center sm:max-h-[min(19rem,34vh)] lg:max-h-[min(20rem,36vh)]"
                />
              </div>
              <div className="mx-auto w-full max-w-xl space-y-3.5 lg:space-y-4">
                <h1 className="text-[1.35rem] font-bold leading-snug tracking-tight text-slate-900 sm:text-2xl lg:text-[1.65rem]">
                  {copy.heroTitle}
                </h1>
                <p className="pl-5 text-left text-sm leading-relaxed text-slate-600 sm:pl-8 sm:text-[0.9375rem] md:pl-12">
                  {copy.heroSubtitle}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-20 flex min-h-0 min-w-0 w-full flex-col justify-center border-t border-slate-200/90 bg-gradient-to-br from-slate-50 via-sky-50/40 to-indigo-50/35 px-8 py-10 shadow-[0_0_40px_rgba(15,23,42,0.06)] sm:px-10 lg:min-w-[min(560px,46vw)] lg:w-[42%] lg:max-w-[640px] lg:flex-1 lg:border-l lg:border-t-0 lg:px-12 lg:py-12">
          <div className="relative z-20 mx-auto w-full max-w-xl lg:min-h-0">
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2 className="text-xl font-semibold leading-tight text-slate-900">{copy.loginHeading}</h2>
              <SiteLanguageSwitcher className="shrink-0" />
            </div>

            <form className="space-y-4" autoComplete="off" onSubmit={(e) => void onSubmit(e)}>
              <label className="grid gap-1">
                <span className="text-sm text-slate-700">{copy.accountLabel}</span>
                <input
                  className="rounded-md border border-slate-200 px-4 py-2.5 font-mono text-sm outline-none placeholder:text-transparent focus:border-slate-400"
                  value={account}
                  onChange={(e) => setAccount(e.target.value.toUpperCase())}
                  name="bss-standalone-account"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  data-lpignore="true"
                  data-1p-ignore
                />
              </label>

              <label className="grid gap-1">
                <span className="text-sm text-slate-700">{copy.passwordLabel}</span>
                <input
                  type="password"
                  className="rounded-md border border-slate-200 px-4 py-2.5 text-sm outline-none placeholder:text-transparent focus:border-slate-400"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  name="bss-standalone-password"
                  autoComplete="new-password"
                  data-lpignore="true"
                  data-1p-ignore
                />
              </label>

              {error ? <p className="text-sm text-red-600">{error}</p> : null}

              <button
                type="submit"
                disabled={submitting}
                className={clsx(
                  "w-full rounded-md py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-55",
                  "bg-slate-900 hover:bg-slate-800"
                )}
              >
                {submitting ? copy.submitting : copy.submit}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
