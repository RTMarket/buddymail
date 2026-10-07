import React, { useMemo, useState } from "react";
import { PageShell } from "../components/PageShell";
import { SectionCard } from "../components/SectionCard";
import { useAuth } from "../../auth/AuthContext";
import { apiJson } from "../../lib/api";
import { useSiteLocale } from "../../i18n/SiteLocaleContext";
import {
  getAccountCenterStrings,
  validateLoginPasswordLocalized
} from "../../i18n/accountCenterI18n";

/** 独立站个人中心：仅改密码（无 SaaS 套餐/邮件订购） */
export function AccountCenterPage() {
  const { locale } = useSiteLocale();
  const copy = useMemo(() => getAccountCenterStrings(locale), [locale]);
  const { user } = useAuth();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    if (newPassword !== confirmPassword) {
      setErr(copy.passwordMismatch);
      return;
    }
    const policyErr = validateLoginPasswordLocalized(newPassword, locale);
    if (policyErr) {
      setErr(policyErr);
      return;
    }
    setSaving(true);
    try {
      await apiJson("/api/me/password", {
        method: "PUT",
        body: JSON.stringify({ newPassword })
      });
      setMsg(copy.passwordUpdated);
      setNewPassword("");
      setConfirmPassword("");
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : copy.changeFailed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell title={copy.pageTitle}>
      <SectionCard title={copy.accountInfoTitle}>
        <p className="text-sm text-slate-600">
          {copy.currentAccountLabel}
          <span className="font-mono font-medium text-slate-900">
            {user?.email?.replace(/@standalone\.local$/i, "")?.toUpperCase() ?? "—"}
          </span>
        </p>
        <p className="mt-2 text-xs text-slate-500">{copy.licenseHint}</p>
      </SectionCard>
      <div className="mt-6">
        <SectionCard title={copy.changePasswordTitle}>
          <form className="max-w-md space-y-3" onSubmit={(e) => void onSubmit(e)}>
            <label className="block text-sm">
              <span className="text-slate-700">{copy.newPasswordLabel}</span>
              <input
                type="password"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={newPassword}
                onChange={(ev) => setNewPassword(ev.target.value)}
                autoComplete="new-password"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-700">{copy.confirmPasswordLabel}</span>
              <input
                type="password"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={confirmPassword}
                onChange={(ev) => setConfirmPassword(ev.target.value)}
                autoComplete="new-password"
              />
            </label>
            {err ? <p className="text-sm text-red-600">{err}</p> : null}
            {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? copy.saving : copy.savePassword}
            </button>
          </form>
        </SectionCard>
      </div>
    </PageShell>
  );
}
