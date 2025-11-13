import { action, ActionCtx, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

export const fetchTypeformForms = action({
  args: {
    email: v.string(),
  },
  handler: async (ctx: ActionCtx, args): Promise<Array<{ id: string; title: string }>> => {
    // Get user's access token from config
    const config: { accessToken?: string } | null = await ctx.runQuery(api.typeform.getConfigForEmail, {
      email: args.email,
    });

    if (!config?.accessToken) {
      throw new Error(`Access token not configured for user: ${args.email}. Please set your Typeform personal access token in settings.`);
    }

    // Fetch forms from Typeform API
    const response: Response = await fetch("https://api.typeform.com/forms", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Typeform API error: ${response.status} ${response.statusText}`;
      try {
        const errorJson: { message?: string } = JSON.parse(errorText);
        if (errorJson.message) {
          errorMessage = `Typeform API error: ${errorJson.message}`;
        }
      } catch {
        if (errorText) {
          errorMessage = `Typeform API error: ${errorText}`;
        }
      }
      throw new Error(errorMessage);
    }

    const data: { items?: Array<{ id: string; title: string; [key: string]: unknown }> } = await response.json();
    
    if (!data.items) {
      return [];
    }

    // Return simplified form list with id and title
    return data.items.map((form) => ({
      id: form.id,
      title: form.title || "Untitled Form",
    }));
  },
});

/**
 * Fetch form details including questions/fields
 */
export const fetchTypeformFormDetails = action({
  args: {
    email: v.string(),
    formId: v.string(),
  },
  handler: async (ctx: ActionCtx, args): Promise<{
    id: string;
    title: string;
    fields: Array<{
      id: string;
      ref: string;
      title: string;
      type: string;
    }>;
  } | null> => {
    // Get user's access token from config
    const config: { accessToken?: string } | null = await ctx.runQuery(api.typeform.getConfigForEmail, {
      email: args.email,
    });

    if (!config?.accessToken) {
      throw new Error(`Access token not configured for user: ${args.email}. Please set your Typeform personal access token in settings.`);
    }

    // Fetch form details from Typeform API
    const response: Response = await fetch(`https://api.typeform.com/forms/${args.formId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Typeform API error: ${response.status} ${response.statusText}`;
      try {
        const errorJson: { message?: string } = JSON.parse(errorText);
        if (errorJson.message) {
          errorMessage = `Typeform API error: ${errorJson.message}`;
        }
      } catch {
        if (errorText) {
          errorMessage = `Typeform API error: ${errorText}`;
        }
      }
      throw new Error(errorMessage);
    }

    const formData: {
      id?: string;
      title?: string;
      fields?: Array<{
        id?: string;
        ref?: string;
        title?: string;
        type?: string;
        properties?: {
          description?: string;
          fields?: Array<{
            id?: string;
            ref?: string;
            title?: string;
            type?: string;
            properties?: {
              description?: string;
              fields?: Array<unknown>;
            };
          }>;
        };
      }>;
    } = await response.json();

    if (!formData.fields || !Array.isArray(formData.fields)) {
      return null;
    }

    // Recursively extract all fields, including nested fields in groups
    const extractFields = (fields: Array<{
      id?: string;
      ref?: string;
      title?: string;
      type?: string;
      properties?: {
        description?: string;
        fields?: Array<unknown>;
      };
    }>): Array<{ id: string; ref: string; title: string; type: string }> => {
      const result: Array<{ id: string; ref: string; title: string; type: string }> = [];
      
      for (const field of fields) {
        // Skip if missing required fields
        if (!field.id || !field.ref || !field.title) {
          continue;
        }
        
        // If it's a group type, extract nested fields
        if (field.type === "group" || field.type === "inline_group") {
          if (field.properties?.fields && Array.isArray(field.properties.fields)) {
            // Recursively extract nested fields (cast to same type for recursion)
            const nestedFields = extractFields(
              field.properties.fields as Array<{
                id?: string;
                ref?: string;
                title?: string;
                type?: string;
                properties?: {
                  description?: string;
                  fields?: Array<unknown>;
                };
              }>
            );
            result.push(...nestedFields);
          }
          // Don't include the group header itself as a question
        } else {
          // Regular field - include it
          result.push({
            id: field.id,
            ref: field.ref,
            title: field.title,
            type: field.type || "unknown",
          });
        }
      }
      
      return result;
    };

    const allFields = extractFields(formData.fields);

    return {
      id: formData.id || args.formId,
      title: formData.title || "Untitled Form",
      fields: allFields,
    };
  },
});

export const fetchTypeformResponses = action({
  args: {
    email: v.string(),
    formId: v.string(),
    since: v.optional(v.string()),
    until: v.optional(v.string()),
    pageSize: v.optional(v.number()),
    after: v.optional(v.string()),
  },
  handler: async (ctx: ActionCtx, args): Promise<unknown> => {
    // Get user's access token from config using the public query
    const config: { accessToken?: string } | null = await ctx.runQuery(api.typeform.getConfigForEmail, {
      email: args.email,
    });

    if (!config?.accessToken) {
      throw new Error(`Access token not configured for user: ${args.email}. Please set your Typeform personal access token in settings.`);
    }

    // Build query parameters
    const queryParams = new URLSearchParams();
    if (args.since) queryParams.set("since", args.since);
    if (args.until) queryParams.set("until", args.until);
    if (args.pageSize) queryParams.set("page_size", args.pageSize.toString());
    if (args.after) queryParams.set("after", args.after);

    const queryString = queryParams.toString();
    const url = `https://api.typeform.com/forms/${args.formId}/responses${queryString ? `?${queryString}` : ""}`;

    // Fetch responses from Typeform API
    const response: Response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Typeform API error: ${response.status} ${response.statusText}`;
      try {
        const errorJson: { message?: string } = JSON.parse(errorText);
        if (errorJson.message) {
          errorMessage = `Typeform API error: ${errorJson.message}`;
        }
      } catch {
        // If error response isn't JSON, use the text
        if (errorText) {
          errorMessage = `Typeform API error: ${errorText}`;
        }
      }
      throw new Error(errorMessage);
    }

    const data: unknown = await response.json();
    return data;
  },
});

// Internal mutation to store response (used by sync action)
export const storeResponseInternal = internalMutation({
  args: {
    email: v.string(),
    formId: v.string(),
    responseId: v.string(),
    payload: v.any(),
    questions: v.optional(v.array(v.object({
      id: v.string(),
      ref: v.string(),
      title: v.string(),
      type: v.string(),
    }))),
    qaPairs: v.optional(v.array(v.object({
      question: v.string(),
      answer: v.string(),
      fieldRef: v.optional(v.string()),
    }))),
  },
  handler: async (ctx, args): Promise<{ inserted: boolean; id: string }> => {
    // Check for duplicate by responseId
    const existing = await ctx.db
      .query("typeform_responses")
      .withIndex("by_response_id", (q) => q.eq("responseId", args.responseId))
      .first();
    
    if (existing) {
      // Duplicate found
      return { inserted: false, id: existing._id };
    }
    
    // No duplicate found, insert new response
    const id = await ctx.db.insert("typeform_responses", {
      email: args.email,
      formId: args.formId,
      responseId: args.responseId,
      payload: args.payload,
      syncedAt: Date.now(),
      questions: args.questions,
      qaPairs: args.qaPairs,
    });
    return { inserted: true, id };
  },
});

export const syncTypeformResponses = action({
  args: {
    email: v.string(),
    formId: v.string(),
  },
  handler: async (ctx: ActionCtx, args): Promise<{ synced: number; skipped: number; total: number }> => {
    // Load per-user settings to determine if auto-generation is enabled
    const userSettings: { autoGenerateOnSync?: boolean } | null = await ctx.runQuery(api.scriptSettings.getSettingsForEmail, {
      email: args.email,
    });
    const autoGenEnabled = userSettings?.autoGenerateOnSync === true;
    console.log("[Workflow][Sync] Auto-generation setting loaded.", {
      email: args.email,
      autoGenEnabled,
    } as any);
    // Get user's access token from config
    const config: { accessToken?: string } | null = await ctx.runQuery(api.typeform.getConfigForEmail, {
      email: args.email,
    });

    if (!config?.accessToken) {
      throw new Error(`Access token not configured for user: ${args.email}. Please set your Typeform personal access token in settings.`);
    }

    // Fetch form details once to get questions
    let formQuestions: Array<{ id: string; ref: string; title: string; type: string }> = [];
    try {
      const formDetails = await ctx.runAction(api.typeformActions.fetchTypeformFormDetails, {
        email: args.email,
        formId: args.formId,
      });
      if (formDetails?.fields) {
        formQuestions = formDetails.fields;
        console.log(`Fetched ${formQuestions.length} questions for form ${args.formId}`);
      } else {
        console.warn(`No fields found in form details for ${args.formId}`);
      }
    } catch (error) {
      console.error(`Failed to fetch form details for ${args.formId}:`, error);
    }

    // Create a map of field ref -> field for quick lookup
    const fieldMap = new Map<string, { id: string; ref: string; title: string; type: string }>();
    formQuestions.forEach((field) => {
      fieldMap.set(field.ref, field);
    });

    let synced = 0;
    let skipped = 0;
    let total = 0;
    let after: string | undefined = undefined;
    let hasMore = true;
    // Collect responseIds that need script generation
    const responseIdsToGenerate: Array<{ responseId: string; ownerEmail: string }> = [];

    // Fetch all responses with pagination
    while (hasMore) {
      const queryParams = new URLSearchParams();
      queryParams.set("page_size", "1000"); // Maximum page size
      if (after) {
        queryParams.set("after", after);
      }

      const url = `https://api.typeform.com/forms/${args.formId}/responses?${queryParams.toString()}`;

      const response: Response = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${config.accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Typeform API error: ${response.status} ${response.statusText}`;
        try {
          const errorJson: { message?: string } = JSON.parse(errorText);
          if (errorJson.message) {
            errorMessage = `Typeform API error: ${errorJson.message}`;
          }
        } catch {
          if (errorText) {
            errorMessage = `Typeform API error: ${errorText}`;
          }
        }
        throw new Error(errorMessage);
      }

      const data: {
        items?: Array<{ token?: string; [key: string]: unknown }>;
        page_count?: number;
      } = await response.json();

      if (!data.items || data.items.length === 0) {
        hasMore = false;
        break;
      }

      total += data.items.length;

      // Process each response
      for (const item of data.items) {
        const responseId = item.token || `response_${Date.now()}_${Math.random()}`;
        
        try {
          // Check if response already exists
          const existingResponse = await ctx.runQuery(api.typeform.getResponseByResponseId, {
            responseId,
          });
          
          // Create Q&A pairs from answers and questions
          const responsePayload = item as { answers?: Array<{ field?: { id?: string; ref?: string; type?: string }; text?: string; email?: string; number?: number; boolean?: boolean; url?: string }> };
          const qaPairs = responsePayload.answers?.map((answer) => {
            const ref = answer.field?.ref;
            const field = ref ? fieldMap.get(ref) : null;
            const value = (
              (answer as any).text ??
              (answer as any).email ??
              (answer as any).url ??
              (typeof (answer as any).number === "number" ? String((answer as any).number) : undefined) ??
              (typeof (answer as any).boolean === "boolean" ? String((answer as any).boolean) : "")
            ) || "";
            return {
              question: field?.title || ref || "Unknown Question",
              answer: value || "",
              fieldRef: ref,
            };
          }) || [];
          
          // Field mapping for the single Typeform form (same as webhook)
          const FIELD_MAPPING: Record<string, { field: string; type: "string" | "number" | "email" }> = {
            // Full Name
            "98e94d78-6c72-4ea2-806e-9675f326550e": { field: "contactFirstName", type: "string" },
            // Business Name
            "01K3PZTF2WHB908HD47FDXE81C": { field: "businessName", type: "string" },
            // Email
            "a0e9781d-38e4-4768-af2c-19a4518d2ac7": { field: "businessEmail", type: "email" },
            // Target Revenue (monthly)
            "6589c67b-c739-4372-96e0-a5e3b6a52220": { field: "targetRevenue", type: "number" },
          };

          if (!existingResponse) {
            // Response doesn't exist, store it with questions and Q&A pairs
            await ctx.runMutation(api.typeform.storeResponse, {
              email: args.email,
              formId: args.formId,
              responseId,
              payload: item,
              questions: formQuestions.length > 0 ? formQuestions : undefined,
              qaPairs: qaPairs.length > 0 ? qaPairs : undefined,
            });
            
            synced++;
          } else {
            // Response exists - always update with latest questions/qaPairs if we have them
            // This ensures we get the correct questions (not group headers) and proper Q&A pairs
            // Always update if we have form questions (even if empty arrays)
            // This ensures we replace group headers with actual questions
            if (formQuestions.length > 0) {
              // Update existing response with questions and Q&A pairs
              try {
                await ctx.runMutation(api.typeform.updateResponseWithQuestions, {
                  responseId,
                  questions: formQuestions,
                  qaPairs: qaPairs, // Always pass, even if empty array
                });
                synced++; // Count as synced since we updated it
                console.log(`Updated response ${responseId} with ${formQuestions.length} questions and ${qaPairs.length} Q&A pairs`);
              } catch (updateError) {
                console.error(`Failed to update response ${responseId}:`, updateError);
                skipped++;
              }
            } else {
              // No form questions available, skip update
              console.warn(`Skipping update for ${responseId} - no form questions available (formQuestions.length = ${formQuestions.length})`);
              skipped++;
            }
          }
            
            // Extract client info using explicit field mapping from qaPairs (same as webhook)
            let businessEmail: string | null = null;
            let businessName: string | null = null;
            let firstName: string | null = null;
            let lastName: string | null = null;
            let targetRevenue: number | null = null;
            
            // Extract data from qaPairs using explicit mapping
            for (const qa of qaPairs) {
              const fieldRef = qa.fieldRef?.trim();
              if (!fieldRef) continue;
              
              const mapping = FIELD_MAPPING[fieldRef];
              if (!mapping) continue;
              
              const value = qa.answer?.trim();
              // Allow empty email (it might be optional)
              if (!value && mapping.field !== "businessEmail") continue;
              
              switch (mapping.field) {
                case "businessName":
                  businessName = value;
                  break;
                case "businessEmail":
                  if (value) {
                    businessEmail = value.toLowerCase().trim();
                  }
                    break;
                case "contactFirstName": {
                  const nameParts = value.split(/\s+/);
                  firstName = nameParts[0] || null;
                  if (nameParts.length > 1) {
                    lastName = nameParts.slice(1).join(" ");
                  }
                  break;
                }
                case "targetRevenue": {
                  // Handle ranges like "20-30k" or "20k-30k"
                  let num: number | null = null;
                  const cleaned = value.replace(/,/g, "").toLowerCase().trim();
                  
                  // Try to parse range (e.g., "20-30k" -> take upper bound)
                  const rangeMatch = cleaned.match(/(\d+)\s*-\s*(\d+)\s*k/i);
                  if (rangeMatch) {
                    const upper = parseInt(rangeMatch[2], 10) * 1000;
                    num = upper;
                  } else {
                    // Try single number with k suffix
                    const kMatch = cleaned.match(/(\d+)\s*k/i);
                    if (kMatch) {
                      num = parseInt(kMatch[1], 10) * 1000;
                    } else {
                      // Try plain number
                      const plainNum = parseInt(cleaned, 10);
                      if (!isNaN(plainNum) && plainNum > 0) {
                        num = plainNum;
                      }
                    }
                  }
                  
                  if (num && num > 0) {
                    targetRevenue = num;
                  }
                  break;
                }
              }
            }
            
            // Fallback: if businessEmail is still missing, try to read it directly from payload answers
            if (!businessEmail && responsePayload.answers && Array.isArray(responsePayload.answers)) {
              // Prefer the specific email fieldRef if present
              const EMAIL_FIELD_REF = "a0e9781d-38e4-4768-af2c-19a4518d2ac7";
              const emailAnswerByRef = responsePayload.answers.find(
                (a) => (a.field?.ref?.trim() === EMAIL_FIELD_REF) && typeof (a as any).email === "string" && (a as any).email.trim().length > 0
              ) as any;
              const emailAnswerAny = responsePayload.answers.find(
                (a) => (a.field?.type === "email" || typeof (a as any).email === "string") && (a as any).email && (a as any).email.trim().length > 0
              ) as any;
              const fallbackEmail = (emailAnswerByRef?.email || emailAnswerAny?.email || "").toLowerCase().trim();
              if (fallbackEmail) {
                businessEmail = fallbackEmail;
                console.log(`[Typeform][Sync] Fallback captured businessEmail from payload answers for ${responseId}: ${businessEmail}`);
              }
            }
            
            // Create/update client if we have business name (businessEmail is optional)
            if (businessName) {
              try {
                await ctx.runMutation(api.clients.upsertClientFromTypeform, {
                  ownerEmail: args.email,
                  businessEmail: businessEmail ? businessEmail.toLowerCase().trim() : undefined,
                  businessName: businessName,
                  contactFirstName: firstName || undefined,
                  contactLastName: lastName || undefined,
                  onboardingResponseId: responseId,
                  targetRevenue: targetRevenue || undefined,
                });
                
                // Collect responseId for script generation if:
                // 1. Auto-gen is enabled
                // 2. No script already exists for this responseId
                if (autoGenEnabled) {
                  // Check if script already exists (idempotency)
                  const existingScript = await ctx.runQuery(api.scripts.getScriptByResponseId, {
                    responseId,
                    ownerEmail: args.email,
                  });
                  
                  if (!existingScript) {
                    responseIdsToGenerate.push({
                      responseId: responseId,
                      ownerEmail: args.email,
                    });
                    console.log(
                      `[Workflow][Sync] Queued script generation for response`,
                      JSON.stringify({ responseId, ownerEmail: args.email, isNewResponse: !existingResponse })
                    );
                  } else {
                    console.log(
                      `[Workflow][Sync] Script already exists for response, skipping`,
                      JSON.stringify({ responseId, scriptId: existingScript._id })
                    );
                  }
                }
              } catch (clientError) {
                // Log but don't fail the sync if client creation fails
                console.error(`[Workflow][Sync] Failed to create/update client for ${businessEmail || businessName}:`, clientError);
              }
            }
            
        } catch (error) {
          // If error, skip it
          skipped++;
        }
      }

      // Check if there are more pages
      if (data.items.length < 1000) {
        hasMore = false;
      } else {
        // Use the token of the last response for pagination
        const lastItem = data.items[data.items.length - 1];
        after = lastItem.token;
        if (!after) {
          hasMore = false;
        }
      }
    }

    // Trigger script generation for all collected responseIds
    // Trigger them in parallel but await to ensure they complete (or fail gracefully)
    if (autoGenEnabled && responseIdsToGenerate.length > 0) {
      console.log(
        `[Workflow][Sync] Triggering script generation for ${responseIdsToGenerate.length} responses`
      );
      
      // Trigger all script generations in parallel
      // Use Promise.allSettled to ensure all are attempted even if some fail
      const results = await Promise.allSettled(
        responseIdsToGenerate.map(({ responseId, ownerEmail }) =>
          ctx.runAction(api.scriptGeneration.triggerScriptGenerationFromResponse, {
            responseId,
            ownerEmail,
          }).catch((error) => {
            console.error(
              `[Workflow][Sync] Failed to trigger script generation for ${responseId}:`,
              error instanceof Error ? error.message : String(error)
            );
            // Return error info instead of throwing
            return { success: false, error: error instanceof Error ? error.message : String(error) };
          })
        )
      );
      
      const succeeded = results.filter(
        (r) => r.status === "fulfilled" && r.value && (r.value as any).success !== false
      ).length;
      const failed = results.length - succeeded;
      console.log(
        `[Workflow][Sync] Script generation results: ${succeeded} succeeded, ${failed} failed out of ${results.length} total`
      );
      // Emit per-response result diagnostics
      results.forEach((r, idx) => {
        const info = responseIdsToGenerate[idx];
        if (r.status === "fulfilled") {
          const val = r.value as any;
          if (val?.success) {
            console.log("[Workflow][Sync] Script generation trigger OK", JSON.stringify({ responseId: info.responseId, ownerEmail: info.ownerEmail }));
          } else {
            console.warn("[Workflow][Sync] Script generation trigger FAILED", JSON.stringify({ responseId: info.responseId, ownerEmail: info.ownerEmail, error: val?.error || "unknown" }));
          }
        } else {
          console.error("[Workflow][Sync] Script generation trigger REJECTED", JSON.stringify({ responseId: info.responseId, ownerEmail: info.ownerEmail, reason: r.reason instanceof Error ? r.reason.message : String(r.reason) }));
        }
      });
    } else if (!autoGenEnabled && responseIdsToGenerate.length > 0) {
      console.log("[Workflow][Sync] Auto-generation disabled. Skipping script generation for collected responses.", {
        count: responseIdsToGenerate.length,
      } as any);
    }

    return { synced, skipped, total };
  },
});

