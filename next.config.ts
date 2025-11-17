import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Completely disable Next.js ESLint integration during builds
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Ensure API routes use Node.js runtime (not edge runtime)
  // This prevents "No such module 'node:https'" errors from Node.js-only packages
  experimental: {
    serverComponentsExternalPackages: [
      '@workos-inc/node',
      'posthog-node',
      '@sentry/node',
      'convex',
    ],
  },
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

// Cloudflare-specific initialization (only runs if @opennextjs/cloudflare is available)
// This is automatically skipped on Vercel deployments
if (typeof process !== 'undefined' && process.env.VERCEL !== '1') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { initOpenNextCloudflareForDev } = require('@opennextjs/cloudflare');
    initOpenNextCloudflareForDev();
  } catch {
    // Cloudflare package not available (e.g., on Vercel) - this is fine
  }
}
