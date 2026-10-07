import React from "react";

/** 开源版：无云端订阅门控，直接放行 */
export function RequireCloudMonthlySubscription(props: { children: React.ReactNode }) {
  return <>{props.children}</>;
}
