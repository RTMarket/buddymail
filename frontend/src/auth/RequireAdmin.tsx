import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

const ONLY_ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL || "admin@example.com").toLowerCase();

export function RequireAdmin(props: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-6 text-sm text-slate-500">加载中...</div>;
  if (!user) return <Navigate to="/admin/login" replace />;
  if (user.role !== "super_admin" || user.email.toLowerCase() !== ONLY_ADMIN_EMAIL) {
    return <Navigate to="/admin/login" replace />;
  }
  return <>{props.children}</>;
}
