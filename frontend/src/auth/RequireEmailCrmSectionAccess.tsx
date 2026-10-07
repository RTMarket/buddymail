import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth, resolveAuthEmailForPreview } from "./AuthContext";
import {
  canAccessEmailCrmSections,
  isEmailCrmSectionHiddenForTenants
} from "../config/emailCrmSectionAccess";

/** 已登录且不在白名单时不可进入 CRM / 邮件与营销相关页（防直链） */
export function RequireEmailCrmSectionAccess(props: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user || !isEmailCrmSectionHiddenForTenants()) {
    return <>{props.children}</>;
  }
  if (canAccessEmailCrmSections(resolveAuthEmailForPreview(user))) {
    return <>{props.children}</>;
  }
  return <Navigate to="/dashboard/usage-modes" replace />;
}
