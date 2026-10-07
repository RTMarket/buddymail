# BuddyMail — the self-hosted AI growth workbench

Find leads, send cold email, manage your CRM, publish to social — all on your own server.

![License: AGPLv3](https://img.shields.io/badge/License-AGPLv3-blue.svg)
![Docker ready](https://img.shields.io/badge/Docker-ready-2496ED.svg)

> **[Demo GIF: lead search → campaign → dashboard, 2 min]**

---

## Why BuddyMail

**Mailchimp economics:** ~$300/month for 10k contacts, forever. Your list lives on their servers, under their rules, metered by their pricing tiers.

**BuddyMail economics:** $0 — self-deploy this repo free — on a $7/mo VPS. Your list, your templates, your sending domain. No subscriptions, no renewals. Data never leaves your machine.

| | Monthly SaaS (Mailchimp / SendGrid) | BuddyMail self-hosted |
|---|---|---|
| Pricing model | Subscription, forever | Free (open source) or one-time install |
| Data ownership | Their servers | Your server |
| Sending domain | Shared / rented | Yours (DKIM/SPF/DMARC wizard included) |
| Daily volume | Tiered by plan | Configurable, your infrastructure |

**Honest note for self-hosters:** a brand-new IP needs warmup — there is no magic. Deliverability is on you. The workbench ships with DKIM/SPF/DMARC tooling, blacklist checks, and automated warmup guardrails to help you do it right.

---

## Features

1. **Lead search** — industry + company deep search, people finder, SMTP email verification
2. **CRM database** — contacts, dedup, CSV import/export, follow-up boards
3. **Email marketing** — templates (you create your own), campaigns, 3s/send throttle, bounce/complaint handling, per-campaign stats
4. **Enterprise mailbox** — bring your own domains, send/receive in one place
5. **Social publishing** — LinkedIn, TikTok, WeChat, Mastodon, Bluesky, Nostr, Telegram, Slack
6. **AI studio** — copywriting, text-to-image, short video (bring your own API keys)
7. **Dashboards & daily report** — what happened today, at a glance
8. **Dedicated sending setup** — DKIM/DNS wizard, one-click IP/domain rotation
9. **API access** — drive the whole workbench from your own agents

> Screenshots: `[lead search]` `[campaign stats]` `[dashboard]` `[dedicated setup]`

---

## Quickstart

Requirements: Docker + a VPS with 2GB RAM (a $7/mo box works).

```bash
git clone https://github.com/RTMarket/buddymail.git
cd buddymail
cp .env.example .env   # fill in: MySQL password, your domains, API keys
docker compose up -d --build
# create your admin account:
docker compose exec backend npx tsx src/scripts/seedStandaloneAdmin.ts admin@example.com 'YourPass123'
# open http://localhost:18080 and log in
```

**First-run checklist:**
1. Create admin account (above)
2. Add your sending domain via the DKIM wizard (装机配置)
3. Send a test email and verify it lands in inbox
4. Import contacts (CSV)
5. Send your first campaign

Warming up IPs, PTR records, and common pitfalls: see `docs/SELFHOST-GUIDE.md`.

---

## Configuration

The full list lives in [`.env.example`](.env.example). The important groups:

| Group | Keys |
|---|---|
| Database | `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` |
| Plan | `OPEN_CORE_PLAN_TIER_ID`, `OPEN_CORE_DAILY_SEND_LIMIT` |
| Sending | `AUTH_EMAIL_SMTP_*`, `BOUNCE_IMAP_*` |
| AI keys | `AI_PROVIDER`, `OPENAI_API_KEY` / `DEEPSEEK_API_KEY` |
| Email verification probe | `LEADS_FINDER_SMTP_PROBE_URL`, `LEADS_FINDER_SMTP_PROBE_TOKEN` (optional — bring your own or skip) |
| Social OAuth | `TIKTOK_*`, `LINKEDIN_*` (optional) |

The SMTP verification probe is optional. Point it at your own probe endpoint, or leave it empty and skip verification.

---

## License — AGPLv3

Plain-language summary:

- **Free** to use, modify, and self-host — including commercially, on your own servers.
- If you run a **modified** version as a network service, you **must share your changes** (that's the Affero clause).
- In practice: you can sell services *around* BuddyMail (install, support, deliverability tuning). You cannot take it private and resell it as a closed hosted product.

Full text: [`LICENSE`](LICENSE).

---

## Want it done for you?

The open-source core above is complete and free. If you'd rather skip the setup, we offer managed install packages:

- **$15** — 24h done-for-you installation on your VPS
- **$39 / $99 / $219 / $399** — one-time install packages by daily sending volume (3k / 30k / 50k / 100k emails/day), incl. deliverability warmup tuning and priority support
- No subscriptions. One-time payment, lifetime use.

→ https://bigsocialboss.com/pricing/buddymail

---

## Roadmap

- [ ] One-click Cloudflare Tunnel / reverse-proxy setup
- [ ] More social connectors (X, Reddit)
- [ ] Bounce auto-cleaning rules UI

Community votes via GitHub Discussions.

---

## FAQ

**How is this different from Mautic / Listmonk?**
Those are sending tools. BuddyMail is the full growth loop: lead search → email → CRM → social, in one workbench.

**Do you phone home?**
No telemetry. Verify it yourself: `grep -r "telemetry\|analytics" --include="*.ts" backend/src frontend/src`.

**Can I use it for spam?**
No. There is a built-in complaint/bounce circuit breaker. Abuse burns *your* IP and *your* domain — that's on you. We enforce the same rules on paid installs.

**Who's behind this?**
[BigSocialBoss](https://bigsocialboss.com) — we dogfood BuddyMail daily for our own outreach.

---

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). PRs welcome; English or Chinese in issues is fine.
