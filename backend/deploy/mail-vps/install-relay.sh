#!/usr/bin/env bash
# R19 — Relay（发信机）幂等装机：Postfix 587/25 + SASL(sasldb) + OpenDKIM
#
# 用法（在 Relay VPS 上，先 scp 本目录或整仓 deploy/mail-vps）：
#   sudo bash install-relay.sh
#   sudo bash install-relay.sh --check
#   BSS_ALLOW_FORCE=1 sudo bash install-relay.sh --force   # 仅测试机
#
# 装机后添加 SMTP 用户（密码须与后台 provision 一致）：
#   sudo bash smtp-user-add.sh 'info@mail.customer.com' '密码'
#
# 每发件域生成 DKIM：
#   sudo bash dkim-genkey.sh mail.customer.com

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

usage() {
  cat <<'EOF'
Relay 发信机装机（幂等）

  sudo bash install-relay.sh [--check] [--dry-run]
  BSS_ALLOW_FORCE=1 sudo bash install-relay.sh --force

已执行过且标记存在时会跳过；--force 会替换 bigsocialboss 配置块（不卸载整包）。
生产机禁止未确认的 --force。
EOF
}

main() {
  if bss_parse_common_args "$@"; then :; else usage; exit 0; fi
  bss_need_root
  bss_ensure_dirs

  if bss_marker_present "relay-base" && [[ "${BSS_FORCE:-0}" != "1" ]]; then
    bss_log "relay-base 已完成（$(bss_marker_path relay-base)），跳过装机。仅加域请用 dkim-genkey.sh"
    if [[ "${BSS_CHECK_ONLY:-0}" == "1" ]]; then
      verify_relay
    fi
    exit 0
  fi

  if [[ "${BSS_CHECK_ONLY:-0}" == "1" ]]; then
    verify_relay
    exit $?
  fi

  bss_log "开始 Relay 装机…"
  preconfigure_postfix_debconf
  bss_apt_install_if_missing postfix libsasl2-modules sasl2-bin opendkim opendkim-tools

  bss_run mkdir -p /etc/opendkim/keys
  bss_run chown -R opendkim:opendkim /etc/opendkim
  for f in KeyTable SigningTable TrustedHosts; do
    [[ -f "/etc/opendkim/${f}" ]] || bss_run touch "/etc/opendkim/${f}"
  done

  install_snippets
  enable_submission
  configure_opendkim
  configure_sasl
  bss_ensure_submission_no_chroot

  bss_run systemctl enable postfix opendkim
  bss_run systemctl restart opendkim
  bss_run systemctl restart postfix

  bss_marker_write "relay-base"
  bss_log "Relay 装机完成。"
  verify_relay
}

preconfigure_postfix_debconf() {
  if dpkg -s postfix >/dev/null 2>&1; then
    return 0
  fi
  bss_log "首次安装 Postfix（非交互）"
  if [[ "${BSS_DRY_RUN:-0}" == "1" ]]; then
    bss_log "[dry-run] debconf-set-selections for postfix"
    return 0
  fi
  debconf-set-selections <<<"postfix postfix/main_mailer_type string Internet Site"
  debconf-set-selections <<<"postfix postfix/mailname string $(hostname -f 2>/dev/null || hostname)"
}

install_snippets() {
  bss_merge_block /etc/postfix/main.cf relay-main "${SCRIPT_DIR}/snippets/relay-main.cf"
  if ! grep -qF 'smtp inet' /etc/postfix/master.cf 2>/dev/null || \
     ! grep -qE '^submission\s+inet' /etc/postfix/master.cf 2>/dev/null; then
    bss_log "启用 master.cf submission (587)"
    if [[ "${BSS_FORCE:-0}" == "1" ]] && grep -qE '^submission\s+inet' /etc/postfix/master.cf 2>/dev/null; then
      bss_run sed -i '/^submission inet/,/^$/d' /etc/postfix/master.cf || true
    fi
    if ! grep -qE '^submission\s+inet' /etc/postfix/master.cf 2>/dev/null; then
      cat "${SCRIPT_DIR}/snippets/relay-master-submission.cf" >>/etc/postfix/master.cf
    fi
  else
    bss_log "master.cf 已有 submission，跳过"
  fi
}

configure_opendkim() {
  if [[ -f /etc/opendkim.conf ]] && ! grep -qF "${BSS_MAIL_VPS_TAG}" /etc/opendkim.conf 2>/dev/null; then
    bss_run cp -a /etc/opendkim.conf "/etc/opendkim.conf.bak.$(date +%Y%m%d%H%M%S)" || true
  fi
  if [[ ! -f /etc/opendkim.conf ]]; then
    bss_log "创建 /etc/opendkim.conf"
    {
      echo "# BEGIN ${BSS_MAIL_VPS_TAG}:opendkim-base"
      cat "${SCRIPT_DIR}/snippets/opendkim-base.conf"
      echo "# END ${BSS_MAIL_VPS_TAG}:opendkim-base"
    } >/etc/opendkim.conf
  else
    bss_merge_block /etc/opendkim.conf opendkim-base "${SCRIPT_DIR}/snippets/opendkim-base.conf"
  fi
  grep -q '127.0.0.1' /etc/opendkim/TrustedHosts 2>/dev/null || echo '127.0.0.1' >>/etc/opendkim/TrustedHosts
  grep -q 'localhost' /etc/opendkim/TrustedHosts 2>/dev/null || echo 'localhost' >>/etc/opendkim/TrustedHosts
  hostname -I 2>/dev/null | awk '{print $1}' | while read -r ip; do
    [[ -n "$ip" ]] && grep -qF "$ip" /etc/opendkim/TrustedHosts 2>/dev/null || echo "$ip" >>/etc/opendkim/TrustedHosts
  done
}

configure_sasl() {
  bss_run mkdir -p /etc/postfix/sasl
  local smtpd_conf="/etc/postfix/sasl/smtpd.conf"
  local snippet="${SCRIPT_DIR}/snippets/relay-sasl-smtpd.conf"
  if [[ -f "$snippet" ]]; then
    if [[ ! -f "$smtpd_conf" ]] || ! grep -qF "auxprop_plugin: sasldb" "$smtpd_conf" 2>/dev/null; then
      bss_log "写入 Postfix SASL 配置 → ${smtpd_conf}"
      bss_run cp -a "$smtpd_conf" "${smtpd_conf}.bak.$(date +%Y%m%d%H%M%S)" 2>/dev/null || true
      bss_run cp "$snippet" "$smtpd_conf"
      bss_run chmod 644 "$smtpd_conf"
    fi
  fi
  if [[ -f /etc/postfix/sasldb2 ]] && ! sasldblistusers2 -f /etc/postfix/sasldb2 >/dev/null 2>&1; then
    bss_run rm -f /etc/postfix/sasldb2
    bss_log "已删除损坏的 sasldb2"
  fi
  postconf -e 'smtpd_sasl_auth_enable=yes' 2>/dev/null || true
}

enable_submission() {
  postconf -M submission/inet 2>/dev/null | grep -q submission && return 0
  : # master.cf block added in install_snippets
}

verify_relay() {
  local ok=0
  for svc in postfix opendkim; do
    if bss_service_active "$svc"; then
      bss_log "OK 服务运行中: $svc"
    else
      bss_warn "服务未运行: $svc"
      ok=1
    fi
  done
  for port in 587 8891; do
    if bss_port_listening "$port"; then
      bss_log "OK 端口监听: $port"
    else
      bss_warn "端口未监听: $port"
      ok=1
    fi
  done
  if command -v postfix >/dev/null; then
    postfix status >/dev/null 2>&1 && bss_log "OK postfix status" || bss_warn "postfix status 异常"
  fi
  return $ok
}

main "$@"
