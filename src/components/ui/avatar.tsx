"use client";

import * as React from "react";

type AvatarProps = React.HTMLAttributes<HTMLDivElement>;

export function Avatar(props: AvatarProps) {
  return (
    <div
      {...props}
      className={
        "inline-flex h-9 w-9 items-center justify-center rounded-full border border-foreground/15 bg-foreground/5 text-sm font-medium text-foreground " +
        (props.className ?? "")
      }
    />
  );
}

type AvatarFallbackProps = React.HTMLAttributes<HTMLSpanElement>;

export function AvatarFallback(props: AvatarFallbackProps) {
  return <span {...props} className={"select-none " + (props.className ?? "")} />;
}


