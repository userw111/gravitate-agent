# Testing Cloudflare Workflows Locally

This guide explains how to test the script generation workflow locally using `wrangler dev`.

## Prerequisites

1. **Wrangler CLI** installed:
   ```bash
   npm install -g wrangler
   # or
   pnpm add -D wrangler
   ```

2. **Environment Variables** set up (see `.dev.vars.example`)

## Quick Start

### 1. Set Up Environment Variables

Copy the example file and fill in your values:

```bash
cd workers
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your actual values
```

Required variables:
- `NEXT_PUBLIC_CONVEX_URL` - Your Convex deployment URL
- `OPENROUTER_API_KEY` - Your OpenRouter API key
- `NEXT_PUBLIC_APP_URL` - Your app URL (http://localhost:3000 for local dev)

### 2. Start the Workflow Worker

In one terminal, start the workflow worker:

```bash
# Option 1: Using npm script (recommended)
npm run workflow:dev

# Option 2: Direct wrangler command
cd workers
wrangler dev script-generation-workflow.ts
```

This will start the worker on `http://localhost:8787` by default.

**Note:** On first run, wrangler will prompt you to login to Cloudflare. Follow the instructions.

### 3. Configure Next.js to Use Local Worker

Set the environment variable to point to your local worker:

```bash
# In your .env.local or .env
WORKFLOW_WORKER_URL=http://localhost:8787
```

### 4. Test the Workflow

#### Option A: Use the Test Script

```bash
# Set test variables
export TEST_RESPONSE_ID=your_test_response_id
export TEST_EMAIL=your_email@example.com
export NEXT_PUBLIC_CONVEX_URL=your_convex_url
export OPENROUTER_API_KEY=your_openrouter_key
export WORKFLOW_WORKER_URL=http://localhost:8787

# Run test (using npm script)
npm run workflow:test

# Or directly
npx tsx workers/test-workflow.ts
```

#### Option B: Use the Test Flow Button

1. Start your Next.js dev server:
   ```bash
   npm run dev
   ```

2. Go to Settings page
3. Click "Run Test Flow" in Script Settings
4. The workflow will automatically use the local worker if `WORKFLOW_WORKER_URL` is set

#### Option C: Test via API Directly

```bash
curl -X POST http://localhost:3000/api/workflows/script-generation \
  -H "Content-Type: application/json" \
  -d '{
    "responseId": "your_test_response_id",
    "email": "your_email@example.com"
  }'
```

## Testing Workflow Steps

The workflow executes these steps:

1. ✅ **Fetch Response** - Gets Typeform response from database
2. ✅ **Check Existing** - Verifies script doesn't already exist
3. ✅ **Extract Data** - Parses client data from qaPairs
4. ✅ **Create Client** - Upserts client in database
5. ✅ **Get Settings** - Loads script generation preferences
6. ✅ **Generate Script** - Calls OpenRouter AI API
7. ✅ **Store Script** - Saves script to database

Each step logs its progress, so you can see exactly where it succeeds or fails.

## Debugging

### View Worker Logs

The `wrangler dev` output shows:
- Request/response details
- Console.log output from the worker
- Error stack traces

### Common Issues

1. **Worker not found**
   - Make sure `wrangler dev` is running
   - Check `WORKFLOW_WORKER_URL` is set correctly

2. **Convex connection failed**
   - Verify `NEXT_PUBLIC_CONVEX_URL` in `.dev.vars`
   - Check Convex deployment is active

3. **OpenRouter API error**
   - Verify `OPENROUTER_API_KEY` is set
   - Check API key has sufficient credits

4. **Response not found**
   - Create a test response first using the test flow
   - Or use an existing responseId from your database

## Testing Without Workflows

If you want to test the direct execution path (without Workflows):

1. Don't set `WORKFLOW_WORKER_URL`
2. The system will automatically fall back to calling `/api/scripts/generate-from-response`
3. This tests the original implementation

## Production Testing

For production testing:

1. Deploy the workflow worker:
   ```bash
   wrangler deploy workers/script-generation-workflow.ts --name script-generation-workflow
   ```

2. Set production environment variables:
   ```bash
   wrangler secret put NEXT_PUBLIC_CONVEX_URL
   wrangler secret put OPENROUTER_API_KEY
   ```

3. Update `WORKFLOW_WORKER_URL` to point to production worker URL

## Next Steps

Once local testing works:
1. Deploy workflow worker to Cloudflare
2. Set up Cloudflare Workflows API credentials
3. Update production environment variables
4. Monitor workflow execution in Cloudflare Dashboard

