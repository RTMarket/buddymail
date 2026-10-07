import React, { useMemo } from "react";
import { EMAIL_PLATFORM_BRAND_TEXT } from "../../lib/emailPlatformBranding";
import { useSiteLocale } from "../../i18n/SiteLocaleContext";
import { getSiteFooterStrings } from "../../i18n/siteFooterI18n";

const SUPPORT_PHONE = "400-0616-505";
const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || "support@example.com";
const LINKEDIN_URL = "https://www.linkedin.com/company/bigsocailboss/?viewAsMember=true";
const WECHAT_QR_SRC = "/contact/wechat-support-qr.png";

function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 114.126 0 2.063 2.063 0 01-2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

export function SiteFooter() {
  const { locale } = useSiteLocale();
  const ui = useMemo(() => getSiteFooterStrings(locale), [locale]);

  return (
    <footer className="shrink-0 border-t border-slate-700/80 bg-slate-900 text-slate-300">
      <div className="mx-auto w-full max-w-6xl px-6 py-6">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{ui.contactHeading}</h2>
            <p className="mt-3 text-sm font-medium text-white">{ui.companyName}</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <span className="text-slate-500">{ui.phoneLabel}</span>
                <a
                  href={`tel:${SUPPORT_PHONE}`}
                  className="text-slate-200 underline-offset-2 hover:text-white hover:underline"
                >
                  {SUPPORT_PHONE}
                </a>
              </li>
              <li>
                <span className="text-slate-500">{ui.emailLabel}</span>
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="text-slate-200 underline-offset-2 hover:text-white hover:underline"
                >
                  {SUPPORT_EMAIL}
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{ui.followHeading}</h2>
            <p className="mt-3 text-sm text-slate-400">{ui.followBody}</p>
            <a
              href={LINKEDIN_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2.5 rounded-lg border border-slate-600 bg-slate-800/80 px-3 py-2 text-sm text-white transition hover:border-[#0a66c2] hover:bg-slate-800"
              aria-label={ui.linkedInAria}
            >
              <LinkedInIcon className="h-5 w-5 text-[#0a66c2]" />
              <span>LinkedIn</span>
            </a>
          </div>

          <div className="flex items-start justify-between gap-3 sm:col-span-2 lg:col-span-1">
            <div className="min-w-0 flex-1">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{ui.wechatHeading}</h2>
              <p className="mt-3 text-sm text-slate-300">{ui.wechatContact}</p>
              <p className="mt-1 text-xs text-slate-500">{ui.wechatHint}</p>
            </div>
            <div className="shrink-0 rounded-md bg-white p-1.5 shadow-sm">
              <img
                src={WECHAT_QR_SRC}
                alt={ui.wechatQrAlt}
                width={72}
                height={72}
                className="h-[4.5rem] w-[4.5rem] object-contain"
                loading="lazy"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 border-t border-slate-700/80 pt-5 text-center text-xs text-slate-500">
          {EMAIL_PLATFORM_BRAND_TEXT}
        </div>
      </div>
    </footer>
  );
}
