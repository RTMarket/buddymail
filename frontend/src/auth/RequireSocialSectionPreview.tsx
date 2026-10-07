import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth, resolveAuthEmailForPreview } from "./AuthContext";
import { canAccessSocialSectionFeatures } from "../config/socialSectionPreview";

/**
 * 与 {@link isSocialSectionPreviewEnforced} 配合：未在白名单时不可进入社交媒体相关页（防直链）。
 */
export function RequireSocialSectionPreview(props: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!canAccessSocialSectionFeatures(resolveAuthEmailForPreview(user))) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{props.children}</>;
}
