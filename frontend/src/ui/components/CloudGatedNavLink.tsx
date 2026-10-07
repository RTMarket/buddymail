import React from "react";
import { Link, type LinkProps } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
/** 开源版：无云端订阅门控，导航目标直接透传 */
function resolveCloudGatedNavTarget(to: string, _ctx: unknown): string {
  return to;
}
import { prefetchAppRouteChunk } from "../../lib/routeChunkPrefetch";
import { useProductModules } from "../../state/ProductModulesContext";

function prefetchFromLinkTo(to: LinkProps["to"]) {
  if (typeof to === "string") prefetchAppRouteChunk(to);
}

/** 侧栏：未购/过期用户点击第 3～7 步页面时，跳转至使用流程指引 */
export function CloudGatedNavLink(props: LinkProps) {
  const { user } = useAuth();
  const { modules } = useProductModules();
  const emailRow = modules.find((m) => m.key === "email");
  const toRaw = typeof props.to === "string" ? props.to : "";
  const resolvedTo =
    typeof props.to === "string"
      ? resolveCloudGatedNavTarget(props.to, { emailRow, user })
      : props.to;

  const state =
    resolvedTo !== toRaw && typeof resolvedTo === "string"
      ? { ...(props.state as object | null | undefined), cloudAccessDenied: true }
      : props.state;

  return (
    <Link
      {...props}
      to={resolvedTo}
      state={state}
      onMouseEnter={(e) => {
        prefetchFromLinkTo(typeof resolvedTo === "string" ? resolvedTo : toRaw);
        props.onMouseEnter?.(e);
      }}
      onFocus={(e) => {
        prefetchFromLinkTo(typeof resolvedTo === "string" ? resolvedTo : toRaw);
        props.onFocus?.(e);
      }}
    />
  );
}
