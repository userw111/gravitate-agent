import { action, ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

const FIREFLIES_API_URL = "https://api.fireflies.ai/graphql";

type FirefliesTranscript = {
  id: string;
  title: string;
  date: string;
  duration?: number;
  transcript_url?: string;
  sentences?: Array<{
    text: string;
    speaker_name?: string;
    speaker_id?: string;
  }>;
  participants?: string[]; // Array of strings, not objects
};

type FirefliesTranscriptsResponse = {
  data?: {
    transcripts?: FirefliesTranscript[];
  };
  errors?: Array<{ message: string }>;
};

/**
 * Fetch all transcripts from Fireflies AI API
 */
export const fetchFirefliesTranscripts = action({
  args: {
    email: v.string(),
  },
  handler: async (ctx: ActionCtx, args): Promise<Array<{
    id: string;
    title: string;
    date: string;
    duration?: number;
    transcript: string;
    participants?: string[];
  }>> => {
    const config: { apiKey?: string } | null = await ctx.runQuery(api.fireflies.getConfigForEmail, {
      email: args.email,
    });

    if (!config?.apiKey) {
      throw new Error(`API key not configured for user: ${args.email}. Please set your Fireflies AI API key in settings.`);
    }

    // GraphQL query to fetch transcripts
    // Based on Fireflies API schema - transcripts is a root query
    // participants is [String!] (array of strings), not an object
    const query = `
      query GetTranscripts {
        transcripts {
          id
          title
          date
          duration
          transcript_url
          sentences {
            text
            speaker_name
          }
          participants
        }
      }
    `;

    const response: Response = await fetch(FIREFLIES_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Fireflies API error: ${response.status} ${response.statusText}`;
      try {
        const errorJson: { message?: string; errors?: Array<{ message: string }> } = JSON.parse(errorText);
        if (errorJson.message) {
          errorMessage = `Fireflies API error: ${errorJson.message}`;
        } else if (errorJson.errors && errorJson.errors.length > 0) {
          errorMessage = `Fireflies API error: ${errorJson.errors[0].message}`;
        }
      } catch {
        if (errorText) {
          errorMessage = `Fireflies API error: ${errorText}`;
        }
      }
      throw new Error(errorMessage);
    }

    const data: FirefliesTranscriptsResponse = await response.json();

    if (data.errors && data.errors.length > 0) {
      throw new Error(`Fireflies API GraphQL error: ${data.errors[0].message}`);
    }

    if (!data.data?.transcripts || !Array.isArray(data.data.transcripts)) {
      return [];
    }

    // Transform and return transcripts
    return data.data.transcripts.map((transcript) => {
      // Combine all sentences into full transcript text
      const fullTranscript = transcript.sentences
        ? transcript.sentences.map((s) => s.text).join(" ")
        : "";

      // Participants is already an array of strings
      const participants = transcript.participants || [];

      return {
        id: transcript.id,
        title: transcript.title || "Untitled Meeting",
        date: transcript.date,
        duration: transcript.duration,
        transcript: fullTranscript,
        participants,
      };
    });
  },
});

/**
 * Sync transcripts from Fireflies AI and store them in the database
 */
export const syncFirefliesTranscripts = action({
  args: {
    email: v.string(),
  },
  handler: async (ctx: ActionCtx, args): Promise<{ synced: number; skipped: number; total: number }> => {
    const transcripts: Array<{
      id: string;
      title: string;
      date: string;
      duration?: number;
      transcript: string;
      participants?: string[];
    }> = await ctx.runAction(api.firefliesActions.fetchFirefliesTranscripts, {
      email: args.email,
    });

    let synced = 0;
    let skipped = 0;

    for (const transcript of transcripts) {
      try {
        // Parse date string to timestamp
        const dateTimestamp = new Date(transcript.date).getTime();

        await ctx.runMutation(api.fireflies.storeTranscript, {
          email: args.email,
          transcriptId: transcript.id,
          meetingId: transcript.id, // Using transcript ID as meeting ID for now
          title: transcript.title,
          transcript: transcript.transcript,
          date: dateTimestamp,
          duration: transcript.duration,
          participants: transcript.participants,
        });
        synced++;
      } catch (error) {
        console.error(`Failed to store transcript ${transcript.id}:`, error);
        skipped++;
      }
    }

    return {
      synced,
      skipped,
      total: transcripts.length,
    };
  },
});

