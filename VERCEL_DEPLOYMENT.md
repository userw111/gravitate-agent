# Deploying to Vercel

This guide explains how to deploy Gravitate Agent to Vercel instead of Cloudflare Workers.

## Quick Start

1. **Push your code to GitHub/GitLab/Bitbucket**
2. **Import the project in Vercel Dashboard**
3. **Configure environment variables** (see below)
4. **Deploy!**

## Changes Made for Vercel Compatibility

The codebase has been updated to work on both Cloudflare Workers and Vercel:

- ✅ `next.config.ts` - Conditionally loads Cloudflare packages only when not on Vercel
- ✅ `tsconfig.json` - Removed Cloudflare-specific type definitions (optional on Vercel)
- ✅ Workflow endpoint - Already has fallback to direct execution (no Cloudflare Workflows needed)
- ✅ All API routes work on standard Next.js runtime
- ✅ `public/_headers` - Cloudflare-specific file (ignored on Vercel, use `vercel.json` if needed)

## Environment Variables

Set these in Vercel Dashboard → Settings → Environment Variables:

### Required
```
WORKOS_API_KEY=sk_your_api_key_here
WORKOS_CLIENT_ID=client_your_client_id_here
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
NEXT_PUBLIC_CONVEX_URL=https://your-convex-deployment.convex.cloud
```

### Optional (for features)
```
OPENROUTER_API_KEY=sk-or-v1-your_key_here
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

### Cloudflare-Specific (Not Needed on Vercel)
These can be left unset - the app will automatically fall back to direct execution:
```
CLOUDFLARE_ACCOUNT_ID= (not needed)
CLOUDFLARE_API_TOKEN= (not needed)
```

## Build Settings

Vercel will automatically detect Next.js:
- **Framework Preset:** Next.js
- **Build Command:** `next build` (default)
- **Output Directory:** `.next` (default)
- **Install Command:** `pnpm install` (or `npm install`)

## What Works on Vercel

✅ All core features:
- Authentication (WorkOS)
- Client management
- Script generation
- Typeform webhooks
- Fireflies webhooks
- Google Drive integration
- Chat/AI features

✅ Workflow fallback:
- The `/api/workflows/script-generation` endpoint automatically falls back to direct execution
- No Cloudflare Workflows needed - scripts are generated via `/api/scripts/generate-from-response`

## What Doesn't Work on Vercel

❌ Cloudflare-specific features:
- Cloudflare Workflows (falls back to direct execution)
- Cloudflare Workers runtime features
- Cloudflare R2 storage (if configured)

These are automatically handled with fallbacks, so your app will work fine.

## Deployment Steps

1. **Connect Repository**
   - Go to [vercel.com](https://vercel.com)
   - Click "Add New Project"
   - Import your GitHub/GitLab/Bitbucket repository

2. **Configure Project**
   - Framework: Next.js (auto-detected)
   - Root Directory: `.` (root)
   - Build Command: `next build` (default)
   - Output Directory: `.next` (default)

3. **Set Environment Variables**
   - Add all required variables from the list above
   - Make sure `NEXT_PUBLIC_APP_URL` matches your Vercel domain

4. **Update WorkOS Redirect URIs**
   - Go to WorkOS Dashboard → Redirect URIs
   - Add: `https://your-app.vercel.app/api/auth/callback`
   - Remove old Cloudflare Workers URLs if needed

5. **Deploy**
   - Click "Deploy"
   - Wait for build to complete
   - Test authentication flow

## Post-Deployment Checklist

- [ ] Test sign-in/sign-out flow
- [ ] Verify environment variables are set correctly
- [ ] Check that Convex connection works
- [ ] Test webhook endpoints (Typeform, Fireflies)
- [ ] Verify script generation works
- [ ] Check that Google Drive integration works (if used)

## Troubleshooting

### Build Fails
- Check that all required environment variables are set
- Verify `NEXT_PUBLIC_CONVEX_URL` is correct
- Check build logs for specific errors

### Authentication Not Working
- Verify `WORKOS_API_KEY` and `WORKOS_CLIENT_ID` are set
- Check that redirect URI in WorkOS matches your Vercel domain
- Ensure `NEXT_PUBLIC_APP_URL` matches your Vercel deployment URL

### API Routes Not Working
- Check that environment variables are set (not just in `.env.local`)
- Verify Vercel environment variables are set for production/preview
- Check function logs in Vercel Dashboard

## Differences from Cloudflare Workers

| Feature | Cloudflare Workers | Vercel |
|---------|-------------------|--------|
| Runtime | Cloudflare Workers | Node.js (Vercel Functions) |
| Workflows | Cloudflare Workflows | Direct execution (fallback) |
| Rate Limiting | Cloudflare Rate Limiting API | Vercel Edge Config (optional) |
| Caching | Cloudflare Cache | Vercel Edge Network |
| Cold Starts | Minimal | Minimal (Vercel Functions) |

## Migration Notes

If you're migrating from Cloudflare Workers:

1. **No code changes needed** - the app already handles both platforms
2. **Update environment variables** - remove Cloudflare-specific ones
3. **Update WorkOS redirect URIs** - point to Vercel domain
4. **Test thoroughly** - especially webhooks and long-running operations

The workflow endpoint (`/api/workflows/script-generation`) will automatically use direct execution instead of Cloudflare Workflows, which works perfectly fine for most use cases.

