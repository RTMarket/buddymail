#!/usr/bin/env bash
# Mail 机上添加 Dovecot passwd-file 用户（退信 INBOX / 与 SMTP 密码一致）
#
#   sudo bash dovecot-user-add.sh 'info@mail.customer.com' 'your-password'

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

main() {
  bss_need_root
  local user="${1:-}"
  local pass="${2:-}"
  if [[ -z "$user" || -z "$pass" ]]; then
    echo "用法: sudo bash dovecot-user-add.sh '<email>' '<password>'" >&2
    exit 1
  fi
  local domain="${user#*@}"
  local local_part="${user%%@*}"
  local hash
  hash="$(doveadm pw -s SHA512-CRYPT -p "$pass" | tr -d '\r')"
  [[ -f /etc/dovecot/users ]] || touch /etc/dovecot/users
  if grep -q "^${user}:" /etc/dovecot/users 2>/dev/null; then
    bss_log "更新已有用户: $user"
    grep -v "^${user}:" /etc/dovecot/users > /etc/dovecot/users.bss.tmp || true
    mv /etc/dovecot/users.bss.tmp /etc/dovecot/users
  fi
  echo "${user}:${hash}" >>/etc/dovecot/users
  chmod 640 /etc/dovecot/users
  chown root:dovecot /etc/dovecot/users
  mkdir -p "/var/mail/vhosts/${domain}/${local_part}"
  chown -R vmail:vmail "/var/mail/vhosts/${domain}" 2>/dev/null || chown -R vmail:mail "/var/mail/vhosts/${domain}" 2>/dev/null || true
  systemctl reload dovecot 2>/dev/null || systemctl restart dovecot
  if doveadm auth test "$user" "$pass" 2>/dev/null | grep -q 'auth succeeded'; then
    bss_log "OK doveadm auth test: $user"
  else
    bss_warn "doveadm auth test 未成功，请检查 /etc/dovecot/users 与 conf.d"
  fi
}

main "$@"
