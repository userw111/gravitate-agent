import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const user = url.searchParams.get("user");
    const body: unknown = await request.json().catch(() => ({} as Record<string, unknown>));
    // For now, just acknowledge receipt. We can add signature verification later.
    const keys = typeof body === "object" && body !== null ? Object.keys(body as Record<string, unknown>) : [];
    console.log("Typeform webhook received for user:", user, "payload keys:", keys);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}


