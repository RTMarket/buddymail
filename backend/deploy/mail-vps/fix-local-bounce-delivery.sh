#!/usr/bin/env bash
# 在邮件 VPS（69.165.65.83）上执行：让退信本地进 Dovecot，而不是 SMTP 连外网 MX。
#
#   sudo bash fix-local-bounce-delivery.sh info@mail.factorysupplychain.com
#
set -euo pipefail

USER_ADDR="${1:-}"
if [[ -z "$USER_ADDR" ]]; then
  echo "用法: sudo bash $0 '<info@mail.example.com>'" >&2
  exit 1
fi

MAIL_DOMAIN="${USER_ADDR#*@}"
SLUG="${MAIL_DOMAIN#mail.}"
SCRIPT="/usr/local/bin/deliver-bsso-${SLUG}"
VIRTUAL="/etc/postfix/virtual"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "请用 root 执行" >&2
  exit 1
fi

# 未列入 relay_domains 时，Postfix 会把该域当外域去连 MX（日志里 216.128.x 超时）
CURRENT_RELAY="$(postconf -h relay_domains 2>/dev/null || echo "")"
if [[ ",${CURRENT_RELAY}," != *",${MAIL_DOMAIN},"* ]]; then
  NEW_RELAY="${CURRENT_RELAY}, ${MAIL_DOMAIN}"
  NEW_RELAY="${NEW_RELAY#*, }"
  postconf -e "relay_domains = ${NEW_RELAY}"
  echo "[ok] relay_domains += ${MAIL_DOMAIN}"
fi

if grep -q "^${USER_ADDR}[[:space:]]" "$VIRTUAL" 2>/dev/null; then
  echo "[skip] 已存在: $USER_ADDR"
else
  cp -a "$VIRTUAL" "${VIRTUAL}.bak.$(date +%Y%m%d%H%M%S)"
  printf '%s\t"|%s"\n' "$USER_ADDR" "$SCRIPT" >>"$VIRTUAL"
  echo "[ok] 已写入 $VIRTUAL"
fi

cat >"$SCRIPT" <<EOF
#!/bin/sh
exec /usr/lib/dovecot/deliver -d '${USER_ADDR}'
EOF
chmod 755 "$SCRIPT"
echo "[ok] $SCRIPT"

postmap "$VIRTUAL"
postfix reload
echo "[ok] postfix reloaded"

postsuper -r ALL 2>/dev/null || true
postqueue -f 2>/dev/null || true
sleep 10
echo "[inbox] $(doveadm mailbox status -u "$USER_ADDR" messages INBOX 2>/dev/null || echo 'doveadm-failed')"
echo "[queue] deferred lines matching domain:"
postqueue -p 2>/dev/null | grep -c "${SLUG}" || true
