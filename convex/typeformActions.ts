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
          
          if (!existingResponse) {
            // Response doesn't exist, store it
            await ctx.runMutation(api.typeform.storeResponse, {
              email: args.email,
              formId: args.formId,
              responseId,
              payload: item,
            });
            synced++;
          } else {
            // Duplicate found, skip it
            skipped++;
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

