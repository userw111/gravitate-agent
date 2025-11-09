"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import * as React from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const client = convexUrl ? new ConvexReactClient(convexUrl) : null;

export default function Providers({ children }: { children: React.ReactNode }) {
  if (!client) {
    if (typeof window !== "undefined") {
      // eslint-disable-next-line no-console
      console.warn("Missing NEXT_PUBLIC_CONVEX_URL; Convex disabled.");
    }
    return <>{children}</>;
  }
  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}


