#!/usr/bin/env bash
# R19 — Mail/PTR 机幂等装机：Dovecot IMAP 993（退信 INBOX）
#
# 用法（在 Mail VPS 上）：
#   sudo bash install-mail.sh
#   sudo bash install-mail.sh --check
#
# 可选：装机时创建首个退信邮箱（密码与 provision smtpPassword 一致）
#   sudo BOUNCE_MAIL_USER='info@mail.customer.com' BOUNCE_MAIL_PASSWORD='secret' bash install-mail.sh
#
# 云厂商须先在 ptr_ip 设置 rDNS → ptr_hostname（见 INSTALL-MAIL.md）

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

usage() {
  cat <<'EOF'
Mail/PTR 机装机（幂等）

  sudo bash install-mail.sh [--check] [--dry-run]
  sudo BOUNCE_MAIL_USER='info@domain' BOUNCE_MAIL_PASSWORD='…' bash install-mail.sh

已装则跳过。退信 IMAP 主机须为 ptr_ip（勿填 Relay IP）。
EOF
}

main() {
  if bss_parse_common_args "$@"; then :; else usage; exit 0; fi
  bss_need_root
  bss_ensure_dirs

  if bss_marker_present "mail-base" && [[ "${BSS_FORCE:-0}" != "1" ]]; then
    bss_log "mail-base 已完成，跳过装机。"
    [[ "${BSS_CHECK_ONLY:-0}" == "1" ]] && verify_mail
    exit 0
  fi

  if [[ "${BSS_CHECK_ONLY:-0}" == "1" ]]; then
    verify_mail
    exit $?
  fi

  bss_log "开始 Mail/PTR 装机…"
  bss_apt_install_if_missing dovecot-core dovecot-imapd ssl-cert

  setup_vmail_user
  setup_dovecot
  ensure_dovecot_ssl_certs
  maybe_create_bounce_user

  bss_run systemctl enable dovecot
  validate_and_restart_dovecot

  bss_marker_write "mail-base"
  bss_log "Mail 装机完成。"
  verify_mail
}

setup_vmail_user() {
  if ! getent group vmail >/dev/null 2>&1; then
    bss_log "创建系统组 vmail"
    bss_run groupadd -r vmail
  fi
  if ! id vmail >/dev/null 2>&1; then
    bss_log "创建系统用户 vmail"
    bss_run useradd -r -u 5000 -g vmail -d /var/mail/vhosts -s /usr/sbin/nologin vmail
  elif [[ "$(id -ng vmail 2>/dev/null || true)" != "vmail" ]]; then
    bss_log "将已有 vmail 用户主组调整为 vmail"
    bss_run usermod -g vmail vmail 2>/dev/null || true
  fi
  bss_run mkdir -p /var/mail/vhosts
  bss_run chown -R vmail:vmail /var/mail/vhosts
}

setup_dovecot() {
  [[ -f /etc/dovecot/users ]] || bss_run touch /etc/dovecot/users
  bss_run chmod 640 /etc/dovecot/users
  bss_run chown root:dovecot /etc/dovecot/users

  local conf_d="/etc/dovecot/conf.d"
  # 未完成 mail-base 标记时强制覆盖配置块（支持装机失败后重试）
  local merge_force=0
  bss_marker_present "mail-base" || merge_force=1
  merge_dovecot_block() {
    if [[ "$merge_force" == "1" ]]; then
      BSS_FORCE=1 bss_merge_block "$@"
    else
      bss_merge_block "$@"
    fi
  }
  merge_dovecot_block "${conf_d}/10-auth.conf" mail-auth "${SCRIPT_DIR}/snippets/mail-dovecot-auth.conf"
  merge_dovecot_block "${conf_d}/20-imap.conf" mail-imap "${SCRIPT_DIR}/snippets/mail-dovecot-imap.conf"

  if [[ -f "${conf_d}/10-auth.conf" ]]; then
    sed -i 's/^!include auth-system.conf.ext/#!include auth-system.conf.ext disabled-by-bss/' "${conf_d}/10-auth.conf" 2>/dev/null || true
    sed -i 's/^!include auth-passwdfile.conf.ext/#!include auth-passwdfile.conf.ext disabled-by-bss/' "${conf_d}/10-auth.conf" 2>/dev/null || true
  fi
}

ensure_dovecot_ssl_certs() {
  local pem="/etc/dovecot/private/dovecot.pem"
  if [[ -f "$pem" ]]; then
    bss_log "Dovecot SSL 证书已存在：$pem"
    return 0
  fi
  bss_log "生成 Dovecot 自签 SSL 证书 → $pem"
  if [[ "${BSS_DRY_RUN:-0}" == "1" ]]; then
    bss_log "[dry-run] openssl 生成 $pem"
    return 0
  fi
  bss_run mkdir -p /etc/dovecot/private
  bss_run chmod 750 /etc/dovecot/private
  bss_run chown root:dovecot /etc/dovecot/private
  local cn
  cn="$(hostname -f 2>/dev/null || hostname 2>/dev/null || echo localhost)"
  openssl req -new -newkey rsa:2048 -days 3650 -nodes -x509 \
    -subj "/CN=${cn}" \
    -keyout "$pem" \
    -out "$pem"
  bss_run chmod 640 "$pem"
  bss_run chown root:dovecot "$pem"
}

validate_and_restart_dovecot() {
  local err_log="/tmp/bss-doveconf-$$.log"
  if ! doveconf -n >"$err_log" 2>&1; then
    bss_warn "doveconf -n 失败，配置无效："
    tail -40 "$err_log" >&2 || true
    rm -f "$err_log"
    exit 1
  fi
  rm -f "$err_log"
  if [[ "${BSS_DRY_RUN:-0}" == "1" ]]; then
    bss_log "[dry-run] systemctl restart dovecot"
    return 0
  fi
  if ! systemctl restart dovecot; then
    bss_warn "systemctl restart dovecot 失败："
    systemctl status dovecot --no-pager -l >&2 || true
    journalctl -u dovecot -n 40 --no-pager >&2 || true
    exit 1
  fi
}

maybe_create_bounce_user() {
  local user="${BOUNCE_MAIL_USER:-}"
  local pass="${BOUNCE_MAIL_PASSWORD:-}"
  if [[ -z "$user" || -z "$pass" ]]; then
    bss_log "未设置 BOUNCE_MAIL_USER/PASSWORD，跳过创建用户；请手动编辑 /etc/dovecot/users"
    return 0
  fi
  bash "${SCRIPT_DIR}/dovecot-user-add.sh" "$user" "$pass"
}

verify_mail() {
  local ok=0
  if bss_service_active dovecot; then
    bss_log "OK dovecot 运行中"
  else
    bss_warn "dovecot 未运行"
    ok=1
  fi
  if bss_port_listening 993; then
    bss_log "OK 993 监听"
  else
    bss_warn "993 未监听"
    ok=1
  fi
  return $ok
}

main "$@"
