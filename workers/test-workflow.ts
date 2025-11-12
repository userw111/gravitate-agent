/**
 * Test script for local workflow testing
 * 
 * Usage:
 *   npx tsx workers/test-workflow.ts
 * 
 * Or with wrangler dev:
 *   wrangler dev workers/script-generation-workflow.ts --test-scheduled
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// Validate required environment variables
if (!convexUrl) {
  console.error("Error: NEXT_PUBLIC_CONVEX_URL or CONVEX_URL must be set");
  process.exit(1);
}

if (!OPENROUTER_API_KEY) {
  console.error("Error: OPENROUTER_API_KEY must be set");
  process.exit(1);
}

// TypeScript now knows convexUrl is string (not undefined)
const CONVEX_URL: string = convexUrl;

// Test with a real responseId from your database
const TEST_RESPONSE_ID = process.env.TEST_RESPONSE_ID || "test_response_id";
const TEST_EMAIL = process.env.TEST_EMAIL || "test@example.com";

async function testWorkflow() {
  console.log("🧪 Testing Script Generation Workflow");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Response ID: ${TEST_RESPONSE_ID}`);
  console.log(`Email: ${TEST_EMAIL}`);
  console.log(`Convex URL: ${CONVEX_URL}`);
  console.log("");

  const convex = new ConvexHttpClient(CONVEX_URL);

  // Step 1: Fetch response
  console.log("📝 Step 1: Fetching Typeform response...");
  const response = await convex.query(api.typeform.getResponseByResponseId, {
    responseId: TEST_RESPONSE_ID,
  });

  if (!response) {
    console.error(`❌ Response not found: ${TEST_RESPONSE_ID}`);
    console.log("\n💡 Tip: Create a test response first using the test flow in settings");
    process.exit(1);
  }

  console.log(`✅ Response found: ${response._id}`);
  console.log(`   Q&A Pairs: ${response.qaPairs?.length || 0}`);
  console.log("");

  // Step 2: Check existing script
  console.log("🔍 Step 2: Checking for existing script...");
  const existingScript = await convex.query(api.scripts.getScriptByResponseId, {
    responseId: TEST_RESPONSE_ID,
    ownerEmail: TEST_EMAIL,
  });

  if (existingScript) {
    console.log(`⚠️  Script already exists: ${existingScript._id}`);
    console.log("   Skipping generation (idempotency check)");
    process.exit(0);
  }

  console.log("✅ No existing script found");
  console.log("");

  // Step 3: Call workflow worker
  console.log("🚀 Step 3: Calling workflow worker...");
  const workflowWorkerUrl = process.env.WORKFLOW_WORKER_URL || "http://localhost:8787";

  try {
    const workflowResponse = await fetch(workflowWorkerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        responseId: TEST_RESPONSE_ID,
        email: TEST_EMAIL,
      }),
    });

    if (!workflowResponse.ok) {
      const errorText = await workflowResponse.text();
      throw new Error(`Workflow failed: ${workflowResponse.status} - ${errorText}`);
    }

    const result = await workflowResponse.json();
    console.log("✅ Workflow completed successfully!");
    console.log("");
    console.log("Result:", JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("❌ Workflow failed:", error);
    console.log("");
    console.log("💡 Make sure the workflow worker is running:");
    console.log("   wrangler dev workers/script-generation-workflow.ts");
    process.exit(1);
  }
}

testWorkflow().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

