# Contributing to BuddyMail

Thanks for helping out. A few ground rules:

## Before you push

- Build both workspaces:
  ```bash
  cd backend && npx tsc --noEmit
  cd ../frontend && npm run build
  ```
- No secrets in commits. Ever. `.env` is git-ignored; use `.env.example` as the template.
- English or Chinese in issues/PRs is fine.

## What we're looking for

- Bug fixes with a clear repro
- New social connectors (see `backend/src/services/socialPublishing*.ts` for the pattern)
- Docs, translations, Docker improvements

## What we won't merge

- Anything that phones home (telemetry, analytics, tracking pixels)
- License changes (the project is AGPLv3, permanently)
- Spam-enabling features (bulk list buying, scraped-email importers)

## Code style

- TypeScript strict mode; no `any` in new code if avoidable
- Follow the existing file layout: `backend/src/routes/*` for HTTP, `backend/src/services/*` for logic, `frontend/src/ui/pages/*` for pages
