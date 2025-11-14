import { getCurrentUser } from "@/lib/auth";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexHttpClient(convexUrl) : null;

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user?.email) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!convex) {
      return new Response(JSON.stringify({ error: "Convex not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const openrouterConfig = await convex.query(api.openrouter.getConfigForEmail, {
      email: user.email,
    });

    // Fallback to environment variable for backwards compatibility
    const apiKey = openrouterConfig?.apiKey || process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: "OpenRouter API key not configured. Please set it in Settings.",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const res = await fetch("https://openrouter.ai/api/v1/credits", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("[Balance API] Error response:", errorText);
      return new Response(JSON.stringify({ error: "Failed to fetch balance" }), {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    const rawData = await res.json();

    const data = rawData as {
      data?: {
        total_credits?: number;
        total_usage?: number;
        credits?: number;
        balance?: {
          total?: number;
          base?: number;
          bonus?: number;
        };
        usage?: {
          credits?: number;
          total?: number;
        };
      };
      credits?: number;
    };
    
    // OpenRouter returns total_credits and total_usage
    // Balance = total_credits - total_usage
    const totalCredits = data?.data?.total_credits;
    const totalUsage = data?.data?.total_usage;
    
    let balance: number | null = null;
    
    if (typeof totalCredits === "number" && typeof totalUsage === "number") {
      balance = totalCredits - totalUsage;
    } else {
      // Fallback to other possible locations
      const rawBalance =
        data?.data?.credits ??
        data?.data?.balance?.total ??
        data?.credits ??
        null;
      
      balance =
        typeof rawBalance === "number"
          ? rawBalance
          : rawBalance !== null && rawBalance !== undefined
            ? Number(rawBalance)
            : null;
    }

    return new Response(JSON.stringify({ balance }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[Balance API] Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

