# BigSocialBoss Standalone Email API v1

This API is for self-hosted standalone installations. Use it from n8n, cron scripts, Cursor, Codex, or your own automation service.

## Authentication

Create an API Key in **API 对接**. The key is shown once.

```bash
curl -sS "http://YOUR_SITE/api/v1/me" \
  -H "Authorization: Bearer bss_live_xxx"
```

API Keys can only access `/api/v1/*`. Browser sessions can also call v1 routes after login.

## Send Rules

- Delivered count is the quota source of truth.
- The server enforces LICENSE daily limits, SMTP readiness, lane occupancy, unsubscribe/complaint filters, and no-MX filtering.
- `email-send-3000` and `email-send-30000` usually use one lane and one tenant-level daily cap.
- `email-send-50000` and `email-send-100000` can use multiple lanes. A lane can only have one active send, and the UI/API should poll `/api/v1/email/dedicated-lanes`.
- `limit` is a target batch size. The backend may stop earlier when the daily delivered cap is reached.

## Error Body

```json
{ "ok": false, "code": "DAILY_LIMIT_REACHED", "message": "Daily limit reached" }
```

Common codes: `DAILY_LIMIT_REACHED`, `LANE_BUSY`, `SMTP_NOT_READY`, `CAMPAIGN_ALREADY_SENDING`, `INVALID_INDUSTRY`, `UNAUTHORIZED`.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/me` | Tenant, plan, daily limit, delivered today, remaining quota |
| GET | `/api/v1/email/templates` | Email templates |
| GET | `/api/v1/email/industry-counts?lite=1` | Industry tags and counts |
| POST | `/api/v1/email/campaigns/preview-count` | Preview audience size |
| POST | `/api/v1/email/campaigns` | Create a campaign |
| POST | `/api/v1/email/campaigns/:id/send` | Start formal send |
| GET | `/api/v1/email/campaigns/:id/send-progress` | Poll send progress |
| POST | `/api/v1/email/campaigns/:id/control` | Stop or pause |
| GET | `/api/v1/email/campaigns/:id/stats` | Campaign stats |
| GET | `/api/v1/email/dedicated-lanes` | Lane and domain snapshot |

## Single-Lane Flow

```bash
API="http://YOUR_SITE"
KEY="bss_live_xxx"

curl -sS "$API/api/v1/email/industry-counts?lite=1" \
  -H "Authorization: Bearer $KEY"

curl -sS "$API/api/v1/email/campaigns/preview-count" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"industries":["Manufacturing"],"groupIds":[]}'

curl -sS "$API/api/v1/email/campaigns" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Daily manufacturing send","templateId":1,"smtpProfileId":1,"groupIds":[],"industries":["Manufacturing"],"scheduleSpecific":false,"scheduleStartAt":null,"sendMode":"immediate"}'

curl -sS "$API/api/v1/email/campaigns/123/send" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"limit":500,"industries":["Manufacturing"],"minIntervalMs":1000}'

curl -sS "$API/api/v1/email/campaigns/123/send-progress" \
  -H "Authorization: Bearer $KEY"
```

## Multi-Lane Flow

```bash
curl -sS "$API/api/v1/email/dedicated-lanes" \
  -H "Authorization: Bearer $KEY"

curl -sS "$API/api/v1/email/campaigns/123/send" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"limit":1000,"industries":["Manufacturing"],"laneIndex":1,"minIntervalMs":1000}'
```

Run one request per lane. The backend rejects a busy lane and still enforces the shared daily delivered cap.

## Daily Cron Pattern

```python
import os, requests

api = os.environ["BSS_API_BASE"]
key = os.environ["BSS_API_KEY"]
headers = {"Authorization": f"Bearer {key}"}

me = requests.get(f"{api}/api/v1/me", headers=headers, timeout=20).json()
if me["ok"] and (me["remainingToday"] is None or me["remainingToday"] > 0):
    requests.post(
        f"{api}/api/v1/email/campaigns/123/send",
        headers={**headers, "Content-Type": "application/json"},
        json={"limit": min(500, me["remainingToday"] or 500), "industries": ["Manufacturing"]},
        timeout=20,
    )
```

## Webhooks

Configure a HTTPS endpoint in **API 对接**. Events:

- `email.send.completed`
- `email.send.daily_limit_reached`
- `email.campaign.stopped`

Verify signatures:

```python
import hmac, hashlib

expected = "sha256=" + hmac.new(secret.encode(), body_bytes, hashlib.sha256).hexdigest()
assert hmac.compare_digest(expected, request_headers["X-BSS-Signature"])
```
