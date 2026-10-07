#!/usr/bin/env bash
# 发信机：按 Postfix 实际 smtpd_sasl_type 写入 SMTP 用户（dovecot 或 sasldb）
#
#   sudo bash relay-smtp-sync.sh 'info@mail.customer.com' 'password'

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

main() {
  bss_need_root
  local user="${1:-}"
  local pass="${2:-}"
  if [[ -z "$user" || -z "$pass" ]]; then
    echo "用法: sudo bash relay-smtp-sync.sh '<smtp_username>' '<password>'" >&2
    exit 1
  fi

  local sasl_type
  sasl_type="$(postconf -h smtpd_sasl_type 2>/dev/null | tr -d ' \r' || echo "")"
  echo "BSS_RELAY_SASL_TYPE=${sasl_type:-unknown}"

  if [[ "$sasl_type" == "dovecot" ]]; then
    sync_dovecot_sasl "$user" "$pass"
  else
    ensure_cyrus_sasldb_config
    sync_sasldb_sasl "$user" "$pass"
  fi
}

ensure_cyrus_sasldb_config() {
  bss_run mkdir -p /etc/postfix/sasl
  local smtpd_conf="/etc/postfix/sasl/smtpd.conf"
  local snippet="${SCRIPT_DIR}/snippets/relay-sasl-smtpd.conf"
  if [[ -f "$snippet" ]]; then
    if [[ ! -f "$smtpd_conf" ]] || ! grep -qF "auxprop_plugin: sasldb" "$smtpd_conf" 2>/dev/null; then
      bss_log "写入 Postfix SASL 配置 → ${smtpd_conf}"
      [[ -f "$smtpd_conf" ]] && bss_run cp -a "$smtpd_conf" "${smtpd_conf}.bak.$(date +%Y%m%d%H%M%S)"
      bss_run cp "$snippet" "$smtpd_conf"
      bss_run chmod 644 "$smtpd_conf"
    elif ! grep -qF "sasldb_path:" "$smtpd_conf" 2>/dev/null; then
      bss_log "补写 sasldb_path → ${smtpd_conf}"
      echo "sasldb_path: /etc/postfix/sasldb2" >>"$smtpd_conf"
    fi
  fi
  if [[ -f /etc/postfix/sasldb2 ]] && ! sasldblistusers2 -f /etc/postfix/sasldb2 >/dev/null 2>&1; then
    bss_log "检测到损坏的 sasldb2，重建"
    bss_run rm -f /etc/postfix/sasldb2
  fi
  bss_run rm -f /var/spool/postfix/etc/postfix/sasldb2 2>/dev/null || true
}

resolve_dovecot_passwd_file() {
  local path=""
  path="$(doveconf -n 2>/dev/null | awk '
    /^passdb \{/ { inpb=1; args="" }
    inpb && /driver = passwd-file/ { pf=1 }
    inpb && pf && /args =/ {
      line=$0
      sub(/^[^=]*= /, "", line)
      gsub(/scheme=[^ ]+ /, "", line)
      gsub(/username_format=[^ ]+ /, "", line)
      print line
      exit
    }
    inpb && /^\}/ { inpb=0; pf=0 }
  ')"
  if [[ -z "$path" ]]; then
    for cand in /etc/dovecot/passwd.mail /etc/dovecot/users; do
      if [[ -f "$cand" ]]; then
        path="$cand"
        break
      fi
    done
  fi
  if [[ -z "$path" ]]; then
    path="/etc/dovecot/passwd.mail"
  fi
  echo "$path"
}

upsert_dovecot_passwd_user() {
  local file="$1"
  local user="$2"
  local pass="$3"
  [[ -f "$file" ]] || bss_run touch "$file"
  bss_run chmod 640 "$file"
  bss_run chown root:dovecot "$file" 2>/dev/null || bss_run chown root:mail "$file"
  local hash
  hash="$(doveadm pw -s SHA512-CRYPT -p "$pass" | tr -d '\r')"
  if grep -q "^${user}:" "$file" 2>/dev/null; then
    grep -v "^${user}:" "$file" > "${file}.bss.tmp" || true
    mv "${file}.bss.tmp" "$file"
    bss_log "已更新已有用户: $user → $file"
  fi
  echo "${user}:${hash}" >>"$file"
  bss_log "已写入用户: $user → $file"
}

sync_dovecot_sasl() {
  local user="$1"
  local pass="$2"
  local passwd_file
  passwd_file="$(resolve_dovecot_passwd_file)"
  bss_log "Postfix 使用 Dovecot SASL，写入 ${passwd_file}（非 sasldb）"

  bss_apt_install_if_missing dovecot-core dovecot-imapd 2>/dev/null || \
    bss_apt_install_if_missing dovecot-core

  upsert_dovecot_passwd_user "$passwd_file" "$user" "$pass"

  bss_run systemctl enable dovecot 2>/dev/null || true
  bss_run systemctl restart dovecot
  bss_run postfix reload 2>/dev/null || bss_run systemctl reload postfix 2>/dev/null || true

  if doveadm auth test "$user" "$pass" 2>&1 | grep -qi 'auth succeeded'; then
    echo "BSS_DOVECOT_AUTH_OK"
    echo "BSS_PASSWD_FILE=${passwd_file}"
    bss_log "doveadm auth test OK: $user"
  else
    echo "BSS_DOVECOT_AUTH_FAIL"
    bss_warn "doveadm auth test 失败，请检查 ${passwd_file}"
    exit 1
  fi

  if command -v testsaslauthd >/dev/null 2>&1; then
    if printf '%s\n%s\n' "$user" "$pass" | testsaslauthd 2>&1 | grep -qi OK; then
      echo "BSS_SASL_AUTH_OK"
    fi
  fi
}

sync_sasldb_sasl() {
  local user="$1"
  local pass="$2"
  bss_log "Postfix 使用 sasldb/cyrus SASL"
  bss_apt_install_if_missing sasl2-bin libsasl2-modules libsasl2-modules-db
  bash "${SCRIPT_DIR}/smtp-user-add.sh" "$user" "$pass"
  bss_ensure_submission_no_chroot
  bss_sync_postfix_sasl_chroot
  bss_run postfix reload 2>/dev/null || bss_run systemctl reload postfix 2>/dev/null || true
  if sasldblistusers2 -f /etc/postfix/sasldb2 2>/dev/null | grep -qF "$user"; then
    echo "BSS_SASL_USER_OK"
  else
    echo "BSS_SASL_USER_MISS"
    exit 1
  fi
  if command -v testsaslauthd >/dev/null 2>&1; then
    if printf '%s\n%s\n' "$user" "$pass" | testsaslauthd -f /etc/postfix/sasldb2 2>&1 | grep -qi OK; then
      echo "BSS_SASL_AUTH_OK"
    else
      bss_warn "testsaslauthd 未通过（Postfix 587 仍可能可用，请点「测试 587 认证」）"
      echo "BSS_SASL_AUTH_WARN"
    fi
  fi
}

main "$@"
