import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Suppress request logging in dev mode
  ...(process.env.NODE_ENV === "development" && {
    onDemandEntries: {
      maxInactiveAge: 25 * 1000,
      pagesBufferLength: 2,
    },
  }),
};

// Suppress Next.js request logs in development
if (process.env.NODE_ENV === "development") {
  const originalLog = console.log;
  console.log = (...args: any[]) => {
    // Filter out Next.js request logs (format: "GET /api/... 200 in ...ms")
    const message = args[0]?.toString() || "";
    if (
      /^(GET|POST|PUT|DELETE|PATCH)\s+\/api\/.*\s+\d+\s+in\s+\d+ms$/.test(
        message.trim()
      )
    ) {
      return; // Suppress this log
    }
    originalLog(...args);
  };
}

export default nextConfig;

// added by create cloudflare to enable calling `getCloudflareContext()` in `next dev`
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';
initOpenNextCloudflareForDev();
