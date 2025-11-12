# Cloudflare Workflows Setup Guide

This guide explains how to set up Cloudflare Workflows for automated script generation.

## Overview

Cloudflare Workflows provides:
- **Long-running execution** (up to 15 minutes)
- **Automatic retries** on failure
- **Step-by-step orchestration** with visibility
- **Error handling** and recovery
- **State management** across steps

## Benefits Over Direct Execution

1. **Reliability**: Automatic retries if a step fails
2. **Observability**: Track each step's progress
3. **Scalability**: Handle many concurrent workflows
4. **Error Recovery**: Resume from failed steps
5. **Future Cron Support**: Easy to schedule recurring scripts

## Setup Steps

### 1. Configure Environment Variables

Add to your `.env` or Cloudflare Workers secrets:

```bash
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_API_TOKEN=your_api_token
```

### 2. Deploy Workflow Worker

Deploy the workflow script as a separate Worker:

```bash
# Create wrangler config for workflow worker
wrangler deploy workers/script-generation-workflow.ts --name script-generation-workflow
```

### 3. Update Webhook/Sync to Use Workflows

Replace direct `fetch` calls with workflow creation:

**Before:**
```typescript
fetch('/api/scripts/generate-from-response', { ... })
```

**After:**
```typescript
fetch('/api/workflows/script-generation', {
  method: 'POST',
  body: JSON.stringify({ responseId, email })
})
```

## Workflow Steps

The workflow executes these steps in order:

1. **Fetch Response**: Get Typeform response from database
2. **Check Existing**: Verify script doesn't already exist (idempotency)
3. **Extract Data**: Parse client data from qaPairs
4. **Create Client**: Upsert client in database
5. **Get Settings**: Load script generation preferences
6. **Generate Script**: Call OpenRouter AI API
7. **Store Script**: Save script to database

## Monitoring

View workflow execution in Cloudflare Dashboard:
- Workflow status and progress
- Step-by-step logs
- Error details and retry attempts
- Execution time and costs

## Fallback Behavior

If Cloudflare Workflows is not configured, the system automatically falls back to direct execution (current behavior).

## Future: Cron-Based Recurring Scripts

Once Workflows are set up, you can easily add scheduled workflows:

```typescript
// Schedule recurring script generation
await createWorkflow({
  name: `recurring-script-${clientId}`,
  schedule: '0 0 * * 0', // Weekly
  input: { clientId, email }
});
```

## Migration Path

1. **Phase 1**: Deploy workflow worker (no breaking changes)
2. **Phase 2**: Update webhook/sync to use workflows (with fallback)
3. **Phase 3**: Monitor and optimize
4. **Phase 4**: Add cron-based recurring scripts

