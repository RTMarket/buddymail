#!/usr/bin/env bash
# Relay 上添加/更新 SASL SMTP 用户（sasldb），密码须与后台 provision 一致
#
#   sudo bash smtp-user-add.sh 'info@mail.customer.com' 'your-password'

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

ensure_sasldb_file() {
  bss_run mkdir -p /etc/postfix/sasl
  if [[ -f /etc/postfix/sasldb2 ]] && ! sasldblistusers2 -f /etc/postfix/sasldb2 >/dev/null 2>&1; then
    bss_log "检测到损坏的 sasldb2，删除后重建"
    bss_run rm -f /etc/postfix/sasldb2
  fi
  if [[ ! -f /etc/postfix/sasldb2 ]]; then
    :
  fi
}

main() {
  bss_need_root
  local user="${1:-}"
  local pass="${2:-}"
  if [[ -z "$user" || -z "$pass" ]]; then
    echo "用法: sudo bash smtp-user-add.sh '<smtp_username>' '<password>'" >&2
    exit 1
  fi
  bss_apt_install_if_missing sasl2-bin libsasl2-modules libsasl2-modules-db
  ensure_sasldb_file
  if sasldblistusers2 -f /etc/postfix/sasldb2 2>/dev/null | grep -qF "$user"; then
    printf '%s\n' "$pass" | saslpasswd2 -f /etc/postfix/sasldb2 "$user"
    bss_log "已更新已有 SASL 用户: $user"
  else
    printf '%s\n' "$pass" | saslpasswd2 -c -f /etc/postfix/sasldb2 "$user"
    bss_log "已创建 SASL 用户: $user"
  fi
  bss_run chown postfix:postfix /etc/postfix/sasldb2 2>/dev/null || true
  bss_run chmod 640 /etc/postfix/sasldb2
  bss_ensure_submission_no_chroot
  bss_sync_postfix_sasl_chroot
  if [[ -f /etc/postfix/sasldb2 ]]; then
    bss_run cp -a /etc/postfix/sasldb2 /etc/sasldb2
    bss_run chown postfix:postfix /etc/sasldb2 2>/dev/null || true
    bss_run chmod 640 /etc/sasldb2
  fi
  if [[ -f /etc/postfix/sasl/smtpd.conf ]] && ! grep -qF 'sasldb_path:' /etc/postfix/sasl/smtpd.conf 2>/dev/null; then
    echo "sasldb_path: /etc/postfix/sasldb2" >> /etc/postfix/sasl/smtpd.conf
  fi
  bss_run postfix reload 2>/dev/null || bss_run systemctl reload postfix 2>/dev/null || true
  bss_log "已写入 SASL 用户: $user"
  sasldblistusers2 -f /etc/postfix/sasldb2 2>/dev/null | grep -F "$user" && bss_log "验证: sasldb 中存在该用户"
}

main "$@"
