import React from "react";

export function EmptyState(props: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6">
      <div className="text-sm font-medium">{props.title}</div>
      {props.description ? (
        <div className="mt-1 text-sm text-slate-600">{props.description}</div>
      ) : null}
      {props.action ? <div className="mt-4">{props.action}</div> : null}
    </div>
  );
}

