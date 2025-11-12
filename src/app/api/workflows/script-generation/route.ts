/**
 * Cloudflare Workflows API endpoint for script generation workflow
 * 
 * This endpoint creates a Cloudflare Workflow that orchestrates:
 * 1. Extract client data from Typeform response
 * 2. Create/update client in database
 * 3. Generate script with AI
 * 4. Store script in database
 * 
 * Workflows provide:
 * - Automatic retries on failure
 * - Long-running execution (up to 15 minutes)
 * - Step-by-step orchestration
 * - Error handling and recovery
 */

import { NextResponse } from "next/server";

const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const WORKFLOW_SCRIPT_NAME = "script-generation-workflow";

/**
 * Create a Cloudflare Workflow for script generation
 * 
 * Note: Cloudflare Workflows API is still in beta. This implementation
 * uses the REST API pattern. Adjust based on actual API availability.
 */
export async function POST(request: Request) {
  // Read body once and reuse
  const body = await request.json() as {
    responseId: string;
    email: string;
    clientId?: string;
  };

  const { responseId, email, clientId } = body;

  try {
    console.log(
      `[Workflow][API] Received workflow request`,
      JSON.stringify({ responseId, email, hasClientId: Boolean(clientId) })
    );
    if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
      // Fallback to direct execution if Workflows not configured
      console.warn("[Workflow][API] Cloudflare Workflows not configured, falling back to direct execution");
      return await executeDirectly(responseId, email, clientId);
    }

    // Create workflow definition
    const workflowDefinition = {
      name: `script-generation-${responseId}`,
      script: WORKFLOW_SCRIPT_NAME,
      input: {
        responseId,
        email,
        clientId,
      },
    };

    // Create workflow via Cloudflare API
    console.log("[Workflow][API] Creating Cloudflare workflow...");
    const workflowResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workflows`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${CLOUDFLARE_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(workflowDefinition),
      }
    );

    if (!workflowResponse.ok) {
      const errorText = await workflowResponse.text();
      console.error("[Workflow][API] Failed to create workflow:", errorText);
      // Fallback to direct execution
      return await executeDirectly(responseId, email, clientId);
    }

    const workflow = await workflowResponse.json() as { result?: { id?: string } };

    console.log(
      "[Workflow][API] Workflow created successfully",
      JSON.stringify({ workflowId: workflow.result?.id, responseId, email })
    );
    return NextResponse.json({
      success: true,
      workflowId: workflow.result?.id,
      message: "Workflow created successfully",
    });
  } catch (error) {
    console.error("[Workflow][API] Error creating workflow:", error);
    // Fallback to direct execution
    return await executeDirectly(responseId, email, clientId);
  }
}

/**
 * Fallback: Execute directly if Workflows not available
 * In local dev, this can call the workflow worker directly
 */
async function executeDirectly(
  responseId: string,
  email: string,
  clientId?: string
) {
  // In local dev, try calling the workflow worker directly if available
  const workflowWorkerUrl = process.env.WORKFLOW_WORKER_URL; // e.g., http://localhost:8787
  if (workflowWorkerUrl) {
    try {
      console.log(
        "[Workflow][API] Using local workflow worker for execution",
        JSON.stringify({ responseId, email, url: workflowWorkerUrl })
      );
      const workflowResponse = await fetch(workflowWorkerUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          responseId,
          email,
          clientId,
        }),
      });

      if (workflowResponse.ok) {
        const result = await workflowResponse.json();
        console.log("[Workflow][API] Local workflow worker completed successfully");
        return NextResponse.json({
          success: true,
          message: "Script generation completed via workflow worker",
          result,
        });
      }
    } catch (error) {
      console.warn("[Workflow][API] Workflow worker not available, falling back to API endpoint:", error);
    }
  }

  // Fallback to calling the existing script generation endpoint
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  console.log(
    "[Workflow][API] Falling back to direct API execution",
    JSON.stringify({ responseId, email, url: `${baseUrl}/api/scripts/generate-from-response` })
  );
  const response = await fetch(
    `${baseUrl}/api/scripts/generate-from-response`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        responseId,
        email,
        clientId,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[Workflow][API] Direct API execution failed:", errorText);
    return NextResponse.json(
      { error: `Script generation failed: ${errorText}` },
      { status: response.status }
    );
  }

  console.log("[Workflow][API] Direct API execution started successfully");
  return NextResponse.json({
    success: true,
    message: "Script generation initiated (direct execution)",
  });
}

