import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth, resolveAuthEmailForPreview } from "./AuthContext";
import { canAccessStoreIntegrationFeatures } from "../config/storeIntegrationPreview";

/** 未在白名单时不可进入独立站电商推送（防直链） */
export function RequireStoreIntegrationPreview(props: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!canAccessStoreIntegrationFeatures(resolveAuthEmailForPreview(user))) {
    return <Navigate to="/dashboard/usage-modes" replace />;
  }
  return <>{props.children}</>;
}
