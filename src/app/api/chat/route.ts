import { getCurrentUser } from "@/lib/auth";

// System prompt that explains available tools
const SYSTEM_PROMPT = `You are a helpful AI assistant for Gravitate Agent, a client management platform. You help users manage their clients, view transcripts, and access business information.

You have access to powerful database tools that can:
1. Read data from tables (clients, transcripts, responses, webhooks, users)
2. Create new records
3. Update existing records
4. Delete records (use carefully)
5. Link transcripts to clients
6. Link Typeform responses to clients

IMPORTANT SECURITY RULES:
- You can ONLY access data belonging to the authenticated user (scoped by ownerEmail)
- You CANNOT access tables containing API keys (typeform_configs, fireflies_configs)
- Always verify ownership before any mutation operation
- When linking transcripts/responses, verify both belong to the user

WORKFLOW FOR LINKING UNLINKED TRANSCRIPTS:
1. First, read unlinked transcripts: database_operation with operation="read", table="fireflies_transcripts", filters={unlinked: true}, includeTranscript=false
2. Get all clients: client_lookup with empty query
3. Carefully analyze possible matches. Consider:
   - Exact participant email to client businessEmail matches (high confidence)
   - Participant email domains that exactly match the client's domain (high confidence)
   - Participant email domains whose core name (strip punctuation/TLD) aligns with a client business name (medium confidence)
   - Transcript titles that closely match client names (medium confidence)
   - Keep track of match confidence and be explicit about your reasoning.
4. Present your proposed matches with reasoning and confidence. Ask for confirmation before executing, unless the user explicitly instructs you to proceed.
5. Link confirmed transcripts one-by-one with database_operation using operation="link_transcript".
6. After linking, verify by reading the transcript to ensure it is no longer unlinked.

When users ask to:
- "Show unlinked transcripts" → use database_operation with operation="read", table="fireflies_transcripts", filters={unlinked: true}, includeTranscript=false
- "Link transcript X to client Y" → use database_operation with operation="link_transcript" (clientId can be Convex ID or businessEmail)
- "Link all unlinked transcripts" → gather evidence, present a plan, then loop through database_operation/link_transcript once confirmed
- "Show all clients" → use client_lookup with empty query
- "Create/update/delete" → use database_operation with appropriate operation

Always be helpful, concise, and focus on providing actionable information. When linking transcripts, always show the plan first before executing.`;

// System prompt for script editing
const SCRIPT_EDITOR_PROMPT = `You are an AI assistant helping to edit a client script. The user will provide instructions on how to modify the script. 

When the user asks you to edit the script, use the update_document tool to apply the changes. The tool accepts the updated HTML content of the entire document.

Important guidelines:
- Preserve the overall structure and formatting of the script
- Make only the changes requested by the user
- Maintain HTML formatting (use proper HTML tags: <h1>, <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em>, <a>, etc.)
- If the user asks for clarification or makes ambiguous requests, ask for clarification before making changes
- Always return the complete updated document as HTML, not just the changed portions`;

// Tool definitions
const TOOLS = [
  {
    type: "function",
    function: {
      name: "client_lookup",
      description: "Search for clients by name, email, or business information. Use this when users ask about specific clients, want to find a client, or need client details.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Optional search term – can be client name, business name, email address, or contact name. Use filters like 'status:active', 'status:paused', or 'status:inactive'. Leave empty to list all clients.",
          },
          limit: {
            type: "number",
            description: "Maximum number of results to return (default: 10 with a query, 100 when listing all clients)",
            default: 10,
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "database_operation",
      description: "Perform database operations (read, create, update, delete) on allowed tables. Can also link transcripts/responses to clients. Tables: clients, fireflies_transcripts, fireflies_webhooks, typeform_responses, typeform_webhooks, users. Cannot access API key tables.",
      parameters: {
        type: "object",
        properties: {
          operation: {
            type: "string",
            enum: ["read", "create", "update", "delete", "link_transcript", "link_response"],
            description: "Operation to perform. 'read' queries data, 'create' inserts new record, 'update' modifies existing record, 'delete' removes record, 'link_transcript' links transcript to client, 'link_response' links Typeform response to client.",
          },
          table: {
            type: "string",
            enum: ["clients", "fireflies_transcripts", "fireflies_webhooks", "typeform_responses", "typeform_webhooks", "users"],
            description: "Table to operate on. Cannot be typeform_configs or fireflies_configs (contains API keys).",
          },
          id: {
            type: "string",
            description: "Record ID (required for update/delete operations)",
          },
          data: {
            type: "object",
            description: "Data for create/update operations. Structure depends on table.",
          },
          filters: {
            type: "object",
            description: "Filters for read operations. Use {unlinked: true} to get unlinked transcripts/responses. Use {clientId: '...'} to filter transcripts by client.",
          },
          limit: {
            type: "number",
            description: "Maximum results for read operations (default: 100, max: 200)",
            default: 100,
          },
          includeTranscript: {
            type: "boolean",
            description: "For fireflies_transcripts reads, set to false to exclude full transcript text (saves tokens). Default: true",
            default: true,
          },
          transcriptId: {
            type: "string",
            description: "Transcript ID (required for link_transcript operation)",
          },
          responseId: {
            type: "string",
            description: "Typeform response ID (required for link_response operation)",
          },
          clientId: {
            type: "string",
            description: "Client ID or businessEmail (required for link_transcript and link_response operations). Can be Convex ID or businessEmail string.",
          },
        },
        required: ["operation", "table"],
      },
    },
  },
];

// Tool for document editing
const UPDATE_DOCUMENT_TOOL = {
  type: "function",
  function: {
    name: "update_document",
    description: "Update the script document with new content. Use this when the user asks you to edit, modify, or change the script. Provide the complete updated HTML content.",
    parameters: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The complete updated HTML content of the script document. Use proper HTML tags like <h1>, <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em>, <a>, etc.",
        },
      },
      required: ["content"],
    },
  },
};

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await request.json() as {
      messages: Array<{ role: string; content: string }>;
      model?: string;
      thinkingEffort?: "low" | "medium" | "high";
      documentContext?: {
        content: string;
      };
    };
    const { messages, model, thinkingEffort = "high", documentContext } = body;
    if (!Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "Invalid messages" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing OPENROUTER_API_KEY" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const referer =
      process.env.NEXT_PUBLIC_APP_URL ||
      (request.headers.get("origin") ?? "") ||
      "http://localhost:3000";

    // Check if model supports reasoning (GPT-5 or GPT-OSS-120B)
    const supportsReasoning = model?.includes("gpt-5") || model?.includes("gpt-oss-120b");
    
    // Determine system prompt and tools based on context
    const isScriptEditor = !!documentContext;
    const systemPrompt = isScriptEditor ? SCRIPT_EDITOR_PROMPT : SYSTEM_PROMPT;
    const availableTools = isScriptEditor ? [...TOOLS, UPDATE_DOCUMENT_TOOL] : TOOLS;
    
    // Prepare messages with system prompt if not already present
    let messagesWithSystem = messages.some((m) => m.role === "system")
      ? messages
      : [{ role: "system", content: systemPrompt }, ...messages];
    
    // Add document context to initial messages if provided
    if (documentContext && !messagesWithSystem.some((m) => m.role === "system" && m.content.includes("Current script content"))) {
      messagesWithSystem = [
        ...messagesWithSystem.slice(0, 1), // Keep system prompt
        {
          role: "user",
          content: `Current script content (HTML):\n\n${documentContext.content}\n\nPlease help me edit this script based on my requests. Return the updated content as HTML.`,
        },
        ...messagesWithSystem.slice(1), // Rest of messages
      ];
    }
    
    const openRouterRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": referer,
        "X-Title": "Gravitate Agent",
      },
      body: JSON.stringify({
        model: model || "openrouter/auto",
        messages: messagesWithSystem,
        tools: availableTools,
        tool_choice: "auto", // Let the model decide when to use tools
        stream: true,
        ...(supportsReasoning && {
          reasoning: {
            effort: thinkingEffort,
          },
        }),
      }),
    });

    if (!openRouterRes.ok) {
      const t = await openRouterRes.text();
      return new Response(JSON.stringify({ error: "Upstream error", detail: t }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Helper function to execute tool calls
    async function executeToolCall(toolCall: {
      id: string;
      name: string;
      arguments: string;
    }): Promise<{ result: unknown; error?: string }> {
      try {
        if (toolCall.name === "update_document") {
          const args = JSON.parse(toolCall.arguments);
          const updatedContent = typeof args.content === "string" ? args.content : "";
          
          // Return the updated content so the client can update the document
          return {
            result: {
              updatedContent,
              success: true,
            },
          };
        }

        if (toolCall.name === "client_lookup") {
          const args = JSON.parse(toolCall.arguments);
          const queryArg = typeof args.query === "string" ? args.query : undefined;
          const limitArg = typeof args.limit === "number" ? args.limit : undefined;
          const isListingAll = !queryArg || queryArg.trim() === "";
          const payload: Record<string, unknown> = {};
          if (queryArg !== undefined) {
            payload.query = queryArg;
          }
          if (limitArg !== undefined) {
            payload.limit = limitArg;
          } else if (isListingAll) {
            payload.limit = 100;
          }

          const toolResponse = await fetch(
            new URL("/api/tools/client-lookup", request.url).toString(),
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Cookie: request.headers.get("Cookie") || "",
              },
              body: JSON.stringify(payload),
            }
          );

          if (!toolResponse.ok) {
            const errorText = await toolResponse.text();
            return {
              result: null,
              error: `Tool execution failed: ${errorText}`,
            };
          }

          const data = await toolResponse.json();
          return { result: data };
        }

        if (toolCall.name === "database_operation") {
          const args = JSON.parse(toolCall.arguments);
          const toolResponse = await fetch(
            new URL("/api/tools/database", request.url).toString(),
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Cookie: request.headers.get("Cookie") || "",
              },
              body: JSON.stringify({
                operation: args.operation,
                table: args.table,
                id: args.id,
                data: args.data,
                filters: args.filters,
                limit: args.limit,
                includeTranscript: args.includeTranscript,
                transcriptId: args.transcriptId,
                responseId: args.responseId,
                clientId: args.clientId,
              }),
            }
          );

          if (!toolResponse.ok) {
            const errorText = await toolResponse.text();
            return {
              result: null,
              error: `Tool execution failed: ${errorText}`,
            };
          }

          const data = await toolResponse.json();
          return { result: data };
        }

        if (toolCall.name === "link_unlinked_transcripts") {
          const args = JSON.parse(toolCall.arguments);
          const toolResponse = await fetch(
            new URL("/api/tools/link-unlinked-transcripts", request.url).toString(),
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Cookie: request.headers.get("Cookie") || "",
              },
              body: JSON.stringify({
                dryRun: args.dryRun,
                limit: args.limit,
                strategy: args.strategy,
              }),
            }
          );

          if (!toolResponse.ok) {
            const errorText = await toolResponse.text();
            return {
              result: null,
              error: `Tool execution failed: ${errorText}`,
            };
          }

          const data = await toolResponse.json();
          return { result: data };
        }

        return {
          result: null,
          error: `Unknown tool: ${toolCall.name}`,
        };
      } catch (error) {
        console.error(`[Tool Execution] Error executing ${toolCall.name}:`, error);
        return {
          result: null,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }

    // Helper function to process a stream and handle tool calls recursively
    async function processStream(
      reader: ReadableStreamDefaultReader<Uint8Array>,
      controller: ReadableStreamDefaultController<Uint8Array>,
      messagesSoFar: Array<any>,
      maxIterations: number = 30
    ): Promise<void> {
      if (maxIterations <= 0) {
        controller.enqueue(
          new TextEncoder().encode(
            `data: ${JSON.stringify({ 
              type: "content", 
              content: "\n\n[Maximum tool call iterations reached. Please ask to proceed with the request.]"
            })}\n\n`
          )
        );
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let reasoningBuffer = "";
      let accumulatedToolCalls: Array<{
        id: string;
        name: string;
        arguments: string;
      }> = [];

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.trim() === "") continue;
            
            if (line.startsWith("data: ")) {
              const dataStr = line.slice(6);
              if (dataStr === "[DONE]") {
                // Execute any pending tool calls before finishing
                if (accumulatedToolCalls.length > 0) {
                  await executeAndContinue(accumulatedToolCalls, messagesSoFar, controller, maxIterations - 1);
                  return;
                }
                controller.enqueue(
                  new TextEncoder().encode(
                    `data: ${JSON.stringify({ 
                      type: "done",
                      reasoning: reasoningBuffer || undefined
                    })}\n\n`
                  )
                );
                return;
              }

              try {
                const data = JSON.parse(dataStr);
                const choice = data.choices?.[0];
                
                if (choice) {
                  const delta = choice.delta;
                  const finishReason = choice.finish_reason;

                  // Handle tool calls accumulation
                  if (delta?.tool_calls) {
                    for (const toolCallDelta of delta.tool_calls) {
                      if (toolCallDelta.index !== undefined) {
                        if (!accumulatedToolCalls[toolCallDelta.index]) {
                          accumulatedToolCalls[toolCallDelta.index] = {
                            id: toolCallDelta.id || "",
                            name: "",
                            arguments: "",
                          };
                        }

                        const tc = accumulatedToolCalls[toolCallDelta.index];
                        if (toolCallDelta.id) tc.id = toolCallDelta.id;
                        if (toolCallDelta.function?.name)
                          tc.name = toolCallDelta.function.name;
                        if (toolCallDelta.function?.arguments)
                          tc.arguments += toolCallDelta.function.arguments;
                      }
                    }
                  }

                  // Execute tool calls immediately when finish_reason is "tool_calls"
                  if (finishReason === "tool_calls" && accumulatedToolCalls.length > 0) {
                    await executeAndContinue(accumulatedToolCalls, messagesSoFar, controller, maxIterations - 1);
                    return;
                  }

                  // Handle reasoning tokens
                  if (delta?.reasoning) {
                    reasoningBuffer += delta.reasoning;
                    controller.enqueue(
                      new TextEncoder().encode(
                        `data: ${JSON.stringify({ 
                          type: "reasoning", 
                          content: delta.reasoning 
                        })}\n\n`
                      )
                    );
                  }

                  // Handle content tokens
                  if (delta?.content) {
                    controller.enqueue(
                      new TextEncoder().encode(
                        `data: ${JSON.stringify({ 
                          type: "content", 
                          content: delta.content 
                        })}\n\n`
                      )
                    );
                  }

                  // Handle other finish reasons
                  if (finishReason && finishReason !== "tool_calls") {
                    controller.enqueue(
                      new TextEncoder().encode(
                        `data: ${JSON.stringify({ 
                          type: "done",
                          reasoning: reasoningBuffer || undefined
                        })}\n\n`
                      )
                    );
                    return;
                  }
                }
              } catch (e) {
                console.error("Failed to parse SSE data:", e);
              }
            }
          }
        }
      } catch (error) {
        controller.error(error);
      }
    }

    // Helper function to execute tool calls and continue with follow-up request
    async function executeAndContinue(
      toolCalls: Array<{ id: string; name: string; arguments: string }>,
      messagesSoFar: Array<any>,
      controller: ReadableStreamDefaultController<Uint8Array>,
      maxIterations: number
    ): Promise<void> {
      const toolResults: Array<{ result: unknown; error?: string }> = [];
      
      // Execute all tool calls
      for (const toolCall of toolCalls) {
        controller.enqueue(
          new TextEncoder().encode(
            `data: ${JSON.stringify({
              type: "tool_call",
              status: "executing",
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              arguments: toolCall.arguments,
            })}\n\n`
          )
        );

        const toolResult = await executeToolCall(toolCall);
        toolResults.push(toolResult);
        
        controller.enqueue(
          new TextEncoder().encode(
            `data: ${JSON.stringify({
              type: "tool_result",
              status: toolResult.error ? "error" : "success",
              toolName: toolCall.name,
              toolCallId: toolCall.id,
              result: toolResult.result,
              error: toolResult.error,
            })}\n\n`
          )
        );
      }

      // Build tool messages for follow-up
      const toolMessages = toolCalls.map((tc) => ({
        role: "assistant" as const,
        content: null,
        tool_calls: [
          {
            id: tc.id,
            type: "function" as const,
            function: {
              name: tc.name,
              arguments: tc.arguments,
            },
          },
        ],
      }));

      const toolResultMessages = toolCalls.map((tc, idx) => {
        const result = toolResults[idx];
        return {
          role: "tool" as const,
          content: result.error
            ? JSON.stringify({ error: result.error })
            : JSON.stringify(result.result),
          tool_call_id: tc.id,
        };
      });

      // Make follow-up request with tool results
      const followUpRes = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            "HTTP-Referer": referer,
            "X-Title": "Gravitate Agent",
          },
          body: JSON.stringify({
            model: model || "openrouter/auto",
            messages: [
              ...messagesWithSystem,
              ...messagesSoFar,
              ...toolMessages,
              ...toolResultMessages,
            ],
            tools: availableTools,
            tool_choice: "auto",
            stream: true,
            ...(supportsReasoning && {
              reasoning: {
                effort: thinkingEffort,
              },
            }),
          }),
        }
      );

      if (followUpRes.ok && followUpRes.body) {
        const followUpReader = followUpRes.body.getReader();
        await processStream(followUpReader, controller, [
          ...messagesSoFar,
          ...toolMessages,
          ...toolResultMessages,
        ], maxIterations);
      } else {
        controller.enqueue(
          new TextEncoder().encode(
            `data: ${JSON.stringify({ 
              type: "content", 
              content: "\n\n[Error: Failed to get follow-up response from AI provider]"
            })}\n\n`
          )
        );
        controller.enqueue(
          new TextEncoder().encode(
            `data: ${JSON.stringify({ type: "done" })}\n\n`
          )
        );
      }
    }

    // Create a ReadableStream to forward the streaming response
    const stream = new ReadableStream({
      async start(controller) {
        const reader = openRouterRes.body?.getReader();

        if (!reader) {
          controller.close();
          return;
        }

        try {
          await processStream(reader, controller, messagesWithSystem, 10);
        } catch (error) {
          controller.error(error);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}


