# Quick Test Guide - Script Generation Workflow

Follow these steps to test the workflow locally with `wrangler dev`.

## Step 1: Set Up Environment Variables

Create a `.dev.vars` file in the `workers/` directory:

```bash
cd workers
cp .dev.vars.example .dev.vars
```

Edit `workers/.dev.vars` and add your values:

```bash
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
OPENROUTER_API_KEY=sk-or-v1-your-key-here
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Step 2: Start the Workflow Worker

In **Terminal 1**, start the workflow worker:

```bash
npm run workflow:dev
```

You should see:
```
⎔ Starting local server...
[wrangler:inf] Ready on http://localhost:8787
```

**Note:** If this is your first time, wrangler will ask you to login to Cloudflare. Follow the prompts.

## Step 3: Configure Next.js to Use Local Worker

In your `.env.local` (or `.env`) file, add:

```bash
WORKFLOW_WORKER_URL=http://localhost:8787
```

## Step 4: Get a Test Response ID

You need a real Typeform response ID from your database. You can:

**Option A:** Use the test flow button in Settings
1. Start your Next.js app: `npm run dev`
2. Go to Settings page
3. Click "Run Test Flow" - this creates a test response
4. Copy the response ID from the logs or database

**Option B:** Use an existing response ID
- Check your Convex dashboard for existing Typeform responses
- Or use the response ID from a previous test

## Step 5: Run the Test

In **Terminal 2**, run the test script:

```bash
# Set your test variables
export TEST_RESPONSE_ID=your_response_id_here
export TEST_EMAIL=your_email@example.com

# Run the test
npm run workflow:test
```

## What to Expect

You should see output like:

```
🧪 Testing Script Generation Workflow
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Response ID: test_1234567890_abc123
Email: your@email.com
Convex URL: https://your-deployment.convex.cloud

📝 Step 1: Fetching Typeform response...
✅ Response found: j1234567890
   Q&A Pairs: 5

🔍 Step 2: Checking for existing script...
✅ No existing script found

🚀 Step 3: Calling workflow worker...
✅ Workflow completed successfully!

Result: {
  "success": true,
  "scriptId": "k1234567890",
  "clientId": "l1234567890",
  "steps": [...]
}
```

## Troubleshooting

### "Workflow worker not available"
- Make sure Terminal 1 has `npm run workflow:dev` running
- Check that `WORKFLOW_WORKER_URL=http://localhost:8787` is set

### "Response not found"
- Make sure `TEST_RESPONSE_ID` matches an actual response in your database
- Create a test response first using the "Run Test Flow" button

### "Convex connection failed"
- Verify `NEXT_PUBLIC_CONVEX_URL` in `workers/.dev.vars` is correct
- Check your Convex deployment is active

### "OpenRouter API error"
- Verify `OPENROUTER_API_KEY` in `workers/.dev.vars` is correct
- Check you have credits in your OpenRouter account

## Alternative: Test via UI

Instead of the test script, you can test via the UI:

1. Start Next.js: `npm run dev`
2. Start workflow worker: `npm run workflow:dev` (Terminal 2)
3. Go to Settings → Script Generation Settings
4. Click "Run Test Flow"
5. Watch the logs in both terminals

The UI test will automatically use the local workflow worker if `WORKFLOW_WORKER_URL` is set!

