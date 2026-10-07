import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth, resolveAuthEmailForPreview } from "./AuthContext";
import { isLeadsSectionHiddenForEmail } from "../config/leadsSectionHidden";

/** Leads 搜索页临时下线时，直链回总览；全功能白名单账号除外。 */
export function RequireLeadsSectionRoute(props: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (isLeadsSectionHiddenForEmail(resolveAuthEmailForPreview(user))) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{props.children}</>;
}
