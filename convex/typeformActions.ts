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
          const responsePayload = item as { answers?: Array<{ field?: { id?: string; ref?: string }; text?: string }> };
          const qaPairs = responsePayload.answers?.map((answer) => {
            const ref = answer.field?.ref;
            const field = ref ? fieldMap.get(ref) : null;
            return {
              question: field?.title || ref || "Unknown Question",
              answer: answer.text || "",
              fieldRef: ref,
            };
          }) || [];
          
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
            
            // Extract client info and create/update client
            // Import extractClientInfo function logic inline
            const clientPayload = item as { answers?: Array<{ text?: string }>; submitted_at?: string };
            let businessEmail: string | null = null;
            let businessName: string | null = null;
            let firstName: string | null = null;
            let lastName: string | null = null;
            let targetRevenue: number | null = null;
            
            if (clientPayload.answers && Array.isArray(clientPayload.answers)) {
              // Extract name (first answer)
              if (clientPayload.answers[0]?.text) {
                const nameParts = clientPayload.answers[0].text.trim().split(/\s+/);
                if (nameParts.length >= 1) firstName = nameParts[0];
                if (nameParts.length >= 2) lastName = nameParts.slice(1).join(" ");
              }
              
              // Extract business name (second answer)
              if (clientPayload.answers[1]?.text) {
                businessName = clientPayload.answers[1].text.trim();
              }
              
              // Extract email
              for (const answer of clientPayload.answers) {
                if (answer.text && answer.text.includes("@")) {
                  const emailMatch = answer.text.match(/[\w.-]+@[\w.-]+\.\w+/);
                  if (emailMatch) {
                    businessEmail = emailMatch[0];
                    break;
                  }
                }
              }
              
              // Extract target revenue
              for (const answer of clientPayload.answers) {
                if (answer.text) {
                  const cleaned = answer.text.replace(/,/g, "").trim();
                  const num = parseInt(cleaned, 10);
                  if (!isNaN(num) && num >= 10000 && num <= 10000000) {
                    targetRevenue = num;
                    break;
                  }
                }
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
              } catch (clientError) {
                // Log but don't fail the sync if client creation fails
                console.error(`Failed to create/update client for ${businessEmail || businessName}:`, clientError);
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

    return { synced, skipped, total };
  },
});

