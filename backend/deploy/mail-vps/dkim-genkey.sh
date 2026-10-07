#!/usr/bin/env bash
# R19 — 为发件子域生成 OpenDKIM 密钥（幂等），并打印 p= 供后台 provision
#
# 用法（Relay 发信机上）：
#   sudo bash dkim-genkey.sh mail.customer.com
#   sudo bash dkim-genkey.sh mail.customer.com default
#   BSS_ALLOW_FORCE=1 sudo bash dkim-genkey.sh mail.customer.com --force

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

usage() {
  cat <<'EOF'
生成 OpenDKIM 密钥并登记 KeyTable/SigningTable

  sudo bash dkim-genkey.sh <sender_domain> [selector]
  sudo bash dkim-genkey.sh mail.customer.com default --check

已存在密钥时跳过；--force 需 BSS_ALLOW_FORCE=1。
EOF
}

extract_dkim_p() {
  local txt_file="$1"
  python3 - "$txt_file" <<'PY'
import re, sys
raw = open(sys.argv[1], encoding="utf-8", errors="ignore").read()
raw = re.sub(r"\s+", "", raw).replace('"', "")
m = re.search(r"p=([A-Za-z0-9+/=]+)", raw)
if not m:
    raise SystemExit("无法从 .txt 解析 p=")
print(m.group(1))
PY
}

register_opendkim_tables() {
  local domain="$1"
  local selector="$2"
  local key_file="/etc/opendkim/keys/${domain}/${selector}.private"
  local key_table_line="${selector}._domainkey.${domain} ${domain}:${selector}:${key_file}"
  local signing_line="*@${domain} ${selector}._domainkey.${domain}"

  grep -qF "$key_table_line" /etc/opendkim/KeyTable 2>/dev/null || echo "$key_table_line" >>/etc/opendkim/KeyTable
  grep -qF "$signing_line" /etc/opendkim/SigningTable 2>/dev/null || echo "$signing_line" >>/etc/opendkim/SigningTable
  grep -qF "$domain" /etc/opendkim/TrustedHosts 2>/dev/null || echo "$domain" >>/etc/opendkim/TrustedHosts
}

main() {
  local domain="" selector="default"
  local flags=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --check|--check-only|--dry-run|--force|-h|--help)
        flags+=("$1")
        ;;
      -*)
        flags+=("$1")
        ;;
      *)
        if [[ -z "$domain" ]]; then domain="$1"
        else selector="$1"
        fi
        ;;
    esac
    shift
  done

  if [[ -z "$domain" ]]; then usage; exit 1; fi
  if bss_parse_common_args "${flags[@]}"; then :; else usage; exit 0; fi
  bss_need_root
  bss_ensure_dirs

  local key_dir="/etc/opendkim/keys/${domain}"
  local priv="${key_dir}/${selector}.private"
  local pub_txt="${key_dir}/${selector}.txt"

  if [[ -f "$priv" && "${BSS_FORCE:-0}" != "1" ]]; then
    bss_log "密钥已存在，跳过生成：$priv"
  else
    if [[ -f "$priv" && "${BSS_FORCE:-0}" == "1" ]]; then
      bss_warn "覆盖既有密钥：$priv"
      bss_run rm -f "$priv" "$pub_txt"
    fi
    bss_apt_install_if_missing opendkim opendkim-tools
    bss_run mkdir -p "$key_dir"
    bss_run opendkim-genkey -b 1024 -d "$domain" -s "$selector" -D "$key_dir"
    bss_run chown opendkim:opendkim "$priv" "${key_dir}/${selector}.txt"
  fi

  register_opendkim_tables "$domain" "$selector"
  bss_run systemctl restart opendkim 2>/dev/null || true

  local p_value
  p_value="$(extract_dkim_p "$pub_txt")"

  echo ""
  bss_log "DKIM 公钥 p= 段（粘贴到管理后台 provision dkimPublicKey）："
  echo "$p_value"
  echo ""
  bss_log "DNS 记录名：${selector}._domainkey.${domain}"
  if command -v opendkim-testkey >/dev/null; then
    opendkim-testkey -d "$domain" -s "$selector" -vvv || bss_warn "opendkim-testkey 未通过（DNS 未生效时正常）"
  fi
}

main "$@"
