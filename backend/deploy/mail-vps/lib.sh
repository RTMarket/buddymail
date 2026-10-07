#!/usr/bin/env bash
# BigSocialBoss mail-vps 装机脚本共享库（R19）
# 被 install-relay.sh / install-mail.sh / dkim-genkey.sh source，勿直接执行。

set -euo pipefail

BSS_MAIL_VPS_TAG="bigsocialboss-mail-vps"
BSS_STATE_DIR="${BSS_STATE_DIR:-/var/lib/bigsocialboss-mail-vps}"
BSS_SNIPPET_DIR="${BSS_SNIPPET_DIR:-/etc/bigsocialboss-mail-vps}"

bss_log() { printf '[%s] %s\n' "$BSS_MAIL_VPS_TAG" "$*"; }
bss_warn() { printf '[%s][WARN] %s\n' "$BSS_MAIL_VPS_TAG" "$*" >&2; }
bss_die() { bss_warn "$*"; exit 1; }

bss_need_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    bss_die "请使用 root 执行：sudo bash $0"
  fi
}

bss_ensure_dirs() {
  mkdir -p "$BSS_STATE_DIR" "$BSS_SNIPPET_DIR"
  chmod 755 "$BSS_STATE_DIR" "$BSS_SNIPPET_DIR"
}

bss_marker_path() { echo "${BSS_STATE_DIR}/$1.done"; }

bss_marker_present() {
  [[ -f "$(bss_marker_path "$1")" ]]
}

bss_marker_write() {
  bss_ensure_dirs
  date -u +"%Y-%m-%dT%H:%M:%SZ" >"$(bss_marker_path "$1")"
}

# 已装则跳过；--force 须显式允许（防误伤生产）
bss_force_allowed() {
  [[ "${BSS_FORCE:-0}" == "1" ]] || [[ "${BSS_ALLOW_FORCE:-}" == "1" ]]
}

bss_parse_common_args() {
  BSS_DRY_RUN=0
  BSS_CHECK_ONLY=0
  BSS_FORCE=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dry-run) BSS_DRY_RUN=1 ;;
      --check|--check-only) BSS_CHECK_ONLY=1 ;;
      --force)
        BSS_FORCE=1
        if ! bss_force_allowed; then
          bss_die "--force 已禁用。测试机可：BSS_ALLOW_FORCE=1 sudo bash $0 --force；生产机禁止盲目 --force。"
        fi
        ;;
      -h|--help) return 2 ;;
      *) bss_die "未知参数: $1（可用 --check --dry-run --force）" ;;
    esac
    shift
  done
  return 0
}

bss_run() {
  if [[ "${BSS_DRY_RUN:-0}" == "1" ]]; then
    bss_log "[dry-run] $*"
    return 0
  fi
  "$@"
}

bss_apt_install_if_missing() {
  local pkgs=("$@")
  local missing=()
  for p in "${pkgs[@]}"; do
    if ! dpkg -s "$p" >/dev/null 2>&1; then
      missing+=("$p")
    fi
  done
  if [[ ${#missing[@]} -eq 0 ]]; then
    bss_log "软件包已安装，跳过 apt：${pkgs[*]}"
    return 0
  fi
  bss_log "安装软件包：${missing[*]}"
  bss_run apt-get update -qq
  if [[ "${BSS_DRY_RUN:-0}" == "1" ]]; then
    bss_log "[dry-run] DEBIAN_FRONTEND=noninteractive apt-get install -y ${missing[*]}"
  else
    DEBIAN_FRONTEND=noninteractive apt-get install -y "${missing[@]}"
  fi
}

# 在 target 中写入 BEGIN/END 标记块；已存在且非 force 则跳过
bss_merge_block() {
  local target="$1"
  local block_name="$2"
  local snippet_file="$3"
  local begin="# BEGIN ${BSS_MAIL_VPS_TAG}:${block_name}"
  local end="# END ${BSS_MAIL_VPS_TAG}:${block_name}"

  if [[ ! -f "$snippet_file" ]]; then
    bss_die "片段不存在: $snippet_file"
  fi

  if [[ -f "$target" ]] && grep -qF "$begin" "$target" 2>/dev/null; then
    if [[ "${BSS_FORCE:-0}" == "1" ]]; then
      bss_log "替换配置块 ${block_name} → ${target}"
      bss_run cp -a "$target" "${target}.bak.$(date +%Y%m%d%H%M%S)"
      bss_run awk -v b="$begin" -v e="$end" '
        $0 == b { skip=1; next }
        $0 == e { skip=0; next }
        !skip { print }
      ' "$target" >"${target}.bss.tmp"
      bss_run mv "${target}.bss.tmp" "$target"
    else
      bss_log "配置块已存在，跳过：${block_name} (${target})"
      return 0
    fi
  fi

  if [[ ! -f "$target" ]]; then
    bss_run touch "$target"
  fi
  {
    echo ""
    echo "$begin"
    cat "$snippet_file"
    echo "$end"
    echo ""
  } >>"$target"
  bss_log "已合并配置块 ${block_name} → ${target}"
}

bss_service_active() {
  systemctl is-active --quiet "$1" 2>/dev/null
}

bss_port_listening() {
  local port="$1"
  ss -lntp 2>/dev/null | grep -q ":${port} " || netstat -lntp 2>/dev/null | grep -q ":${port} "
}

# Postfix submission 默认 chroot=y，Cyrus sasldb 在 /etc/postfix 外会导致 587 AUTH 535
bss_ensure_submission_no_chroot() {
  if postconf -F submission/inet/chroot >/dev/null 2>&1; then
    postconf -F submission/inet/chroot=n 2>/dev/null || true
  elif [[ -f /etc/postfix/master.cf ]]; then
    awk '
      /^submission[[:space:]]+inet/ {
        if (NF >= 5 && $5 == "y") { $5 = "n" }
        print
        next
      }
      { print }
    ' /etc/postfix/master.cf > /etc/postfix/master.cf.bss-chroot.tmp
    mv /etc/postfix/master.cf.bss-chroot.tmp /etc/postfix/master.cf
  fi
}

bss_sync_postfix_sasl_chroot() {
  local etc="/var/spool/postfix/etc/postfix"
  bss_run mkdir -p "${etc}/sasl"
  if [[ -f /etc/postfix/sasldb2 ]]; then
    bss_run cp -a /etc/postfix/sasldb2 "${etc}/sasldb2"
    bss_run chown root:postfix "${etc}/sasldb2" 2>/dev/null || bss_run chown postfix:postfix "${etc}/sasldb2"
    bss_run chmod 640 "${etc}/sasldb2"
  fi
  if [[ -f /etc/postfix/sasl/smtpd.conf ]]; then
    bss_run cp -a /etc/postfix/sasl/smtpd.conf "${etc}/sasl/smtpd.conf"
    bss_run chmod 644 "${etc}/sasl/smtpd.conf"
  fi
}
