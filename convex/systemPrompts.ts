import { query, mutation, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { getOrganizationIdForEmail, getOrCreateOrganizationIdForEmail } from "./utils/organizations";

const DEFAULT_SYSTEM_PROMPT = `You are an expert video script writer creating personalized outreach scripts for businesses.

Create a professional, engaging video script in HTML format that will be used for outreach. The script should:
- Be personalized based on the client's information
- Include clear sections with HTML headings (h1, h2, h3)
- Use proper HTML formatting (p, ul, ol, li, strong, em tags)
- Be conversational and engaging
- Include a strong call-to-action
- Be approximately 2-3 minutes when read aloud`;

const HTML_FORMATTING_INSTRUCTION = `\n\nFormat the response as clean HTML without any markdown code blocks or explanations.`;

/**
 * Get the system prompt for a user WITHOUT the HTML formatting instruction (for editing in Studio)
 * Strips out the HTML formatting instruction if it's already present
 */
export const getSystemPromptForEditing = query({
  args: { email: v.string() },
  handler: async (ctx: QueryCtx, args) => {
    const organizationId = await getOrganizationIdForEmail(ctx, args.email);
    let prompt = null;
    if (organizationId) {
      prompt = await ctx.db
        .query("system_prompts")
        .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
        .unique();
    }

    if (!prompt) {
      // Fallback for legacy email-scoped prompts
      prompt = await ctx.db
        .query("system_prompts")
        .withIndex("by_email", (q) => q.eq("email", args.email))
        .unique();
    }

    const userPrompt = prompt?.prompt || DEFAULT_SYSTEM_PROMPT;
    // Remove HTML formatting instruction if it's already present (for backwards compatibility)
    const formattingInstruction = "Format the response as clean HTML without any markdown code blocks or explanations.";
    if (userPrompt.includes(formattingInstruction)) {
      return userPrompt.replace(new RegExp(`\\s*${formattingInstruction.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'), '').trim();
    }
    return userPrompt;
  },
});

/**
 * Get the system prompt for a user WITH the HTML formatting instruction automatically appended (for script generation)
 * Ensures the HTML formatting instruction is present exactly once
 */
export const getSystemPrompt = query({
  args: { email: v.string() },
  handler: async (ctx: QueryCtx, args) => {
    const organizationId = await getOrganizationIdForEmail(ctx, args.email);
    let prompt = null;
    if (organizationId) {
      prompt = await ctx.db
        .query("system_prompts")
        .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
        .unique();
    }

    if (!prompt) {
      prompt = await ctx.db
        .query("system_prompts")
        .withIndex("by_email", (q) => q.eq("email", args.email))
        .unique();
    }

    let userPrompt = prompt?.prompt || DEFAULT_SYSTEM_PROMPT;
    
    // Remove HTML formatting instruction if it's already present (for backwards compatibility)
    const formattingInstruction = "Format the response as clean HTML without any markdown code blocks or explanations.";
    if (userPrompt.includes(formattingInstruction)) {
      userPrompt = userPrompt.replace(new RegExp(`\\s*${formattingInstruction.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'), '').trim();
    }
    
    // Automatically append HTML formatting instruction
    return userPrompt + HTML_FORMATTING_INSTRUCTION;
  },
});

/**
 * Update or create the system prompt for a user
 * Automatically strips out the HTML formatting instruction before saving (it will be appended automatically)
 */
export const updateSystemPrompt = mutation({
  args: {
    email: v.string(),
    prompt: v.string(),
  },
  handler: async (ctx: MutationCtx, args) => {
    // Strip out HTML formatting instruction if present (it will be appended automatically)
    const formattingInstruction = "Format the response as clean HTML without any markdown code blocks or explanations.";
    let cleanedPrompt = args.prompt;
    if (cleanedPrompt.includes(formattingInstruction)) {
      cleanedPrompt = cleanedPrompt.replace(new RegExp(`\\s*${formattingInstruction.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'), '').trim();
    }

    const organizationId = await getOrCreateOrganizationIdForEmail(ctx, args.email);
    const existing = await ctx.db
      .query("system_prompts")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .unique();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        prompt: cleanedPrompt,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("system_prompts", {
      organizationId,
      email: args.email,
      prompt: cleanedPrompt,
      createdAt: now,
      updatedAt: now,
    });
  },
});

