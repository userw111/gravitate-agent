# Fix for "No such module 'node:https'" Error

## Problem
The error `⨯ Error: No such module "node:https"` occurs when Next.js tries to bundle Node.js-specific packages (like `@workos-inc/node`) for edge runtime environments.

## Solution Applied

1. **Added `serverComponentsExternalPackages`** in `next.config.ts`:
   - Tells Next.js not to bundle these Node.js-only packages
   - Includes: `@workos-inc/node`, `posthog-node`, `@sentry/node`, `convex`

2. **Vercel Default Runtime**:
   - Vercel API routes use Node.js runtime by default
   - This ensures Node.js modules like `node:https` are available

## If Error Persists

If you still see the error, you may need to explicitly set the runtime in API route files:

```typescript
// Add at the top of API route files that use Node.js packages
export const runtime = 'nodejs'; // or 'edge' if you want edge runtime
```

However, this should not be necessary on Vercel as Node.js is the default.

## Testing

After deploying to Vercel:
1. Check build logs for any bundling warnings
2. Test API routes that use WorkOS (`/api/auth/*`)
3. Verify Convex connections work

## Alternative: Use Edge-Compatible Packages

If you need edge runtime support:
- Replace `@workos-inc/node` with WorkOS REST API calls using `fetch`
- Use `convex/browser` (already being used) instead of `convex/server`

