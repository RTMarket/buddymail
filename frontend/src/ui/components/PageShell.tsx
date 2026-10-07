import React from "react";

export function PageShell(props: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  banner?: React.ReactNode;
  children: React.ReactNode;
  /** 覆盖标题字号（默认 text-xl），例如传 "text-xs font-semibold" */
  titleClassName?: string;
  /** 覆盖描述字号（默认 text-sm），例如传 "text-xs" */
  descriptionClassName?: string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className={props.titleClassName || "text-xl font-semibold"}>{props.title}</h1>
          {props.description != null && props.description !== "" ? (
            <div className={props.descriptionClassName || "mt-1 text-sm text-slate-600"}>{props.description}</div>
          ) : null}
        </div>
        {props.actions ? <div className="shrink-0">{props.actions}</div> : null}
      </div>
      {props.banner ? <div>{props.banner}</div> : null}
      {props.children}
    </div>
  );
}

