import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexHttpClient(convexUrl) : null;

// Google Drive API helpers
const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3"; // not used yet

type DriveListResponse = {
  files?: Array<{ id: string; name: string; webViewLink?: string; parents?: string[] }>;
};

async function fetchWithAuth(url: string, accessToken: string, init?: RequestInit) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
  };
  if (init?.headers) {
    Object.assign(headers, init.headers as Record<string, string>);
  }
  return await fetch(url, { ...init, headers });
}

function monthYearLabel(dateMs: number): string {
  const d = new Date(dateMs);
  const month = d.toLocaleString("en-US", { month: "long" });
  const year = d.getFullYear();
  return `${month} ${year} Ads`;
}

async function ensureAnyoneWriter(folderId: string, accessToken: string) {
  // Create or ensure an 'anyone' writer permission exists
  // We will attempt to create blindly; Drive dedupes similar permissions
  await fetchWithAuth(`${DRIVE_API_BASE}/files/${folderId}/permissions`, accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      role: "writer",
      type: "anyone",
      allowFileDiscovery: false,
    }),
  }).catch(() => {});
}

async function findFolderByAppProps(accessToken: string, queryParts: string[]): Promise<any | null> {
  const q = queryParts.join(" and ");
  const url = `${DRIVE_API_BASE}/files?q=${encodeURIComponent(q)}&fields=files(id,name,webViewLink,parents)`;
  const res = await fetchWithAuth(url, accessToken);
  if (!res.ok) return null;
  const json = (await res.json()) as DriveListResponse;
  const files = json.files || [];
  return files[0] || null;
}

async function createFolder(
  name: string,
  accessToken: string,
  parentId?: string,
  appProperties?: Record<string, string>
): Promise<any> {
  const res = await fetchWithAuth(`${DRIVE_API_BASE}/files?fields=id,name,webViewLink,parents`, accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      ...(parentId ? { parents: [parentId] } : {}),
      ...(appProperties ? { appProperties } : {}),
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Failed to create folder ${name}: ${res.status} ${t}`);
  }
  return await res.json();
}

async function findOrCreateClientFolder(
  accessToken: string,
  ownerEmail: string,
  clientId: string,
  clientName: string
): Promise<any> {
  // Prefer lookup by appProperties to avoid name collisions
  const existing = await findFolderByAppProps(accessToken, [
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
    `appProperties has { key='clientId' and value='${clientId}' }`,
  ]);
  if (existing) {
    await ensureAnyoneWriter(existing.id, accessToken);
    return existing;
  }
  const folder = await createFolder(clientName, accessToken, undefined, {
    ownerEmail,
    clientId,
    type: "client",
  });
  await ensureAnyoneWriter(folder.id, accessToken);
  return folder;
}

async function findOrCreateMonthFolder(
  accessToken: string,
  parentId: string,
  ownerEmail: string,
  clientId: string,
  dateMs: number
): Promise<any> {
  const label = monthYearLabel(dateMs);
  const url = `${DRIVE_API_BASE}/files?q=${encodeURIComponent(
    [
      "mimeType = 'application/vnd.google-apps.folder'",
      "trashed = false",
      `'${parentId}' in parents`,
      `name = '${label.replace(/'/g, "\\'")}'`,
    ].join(" and ")
  )}&fields=files(id,name,webViewLink,parents)`;
  const foundRes = await fetchWithAuth(url, accessToken);
  if (foundRes.ok) {
    const json = (await foundRes.json()) as DriveListResponse;
    const files = json.files || [];
    if (files[0]) {
      await ensureAnyoneWriter(files[0].id, accessToken);
      return files[0];
    }
  }
  const folder = await createFolder(label, accessToken, parentId, {
    ownerEmail,
    clientId,
    type: "month",
  });
  await ensureAnyoneWriter(folder.id, accessToken);
  return folder;
}

const SUBFOLDERS = ["Ad 1", "Ad 2", "Ad 3", "Ad 4", "Ad 5", "B-Roll"];

async function ensureSubfolders(accessToken: string, parentId: string) {
  // Fetch existing children names once
  const url = `${DRIVE_API_BASE}/files?q=${encodeURIComponent(
    [
      "mimeType = 'application/vnd.google-apps.folder'",
      "trashed = false",
      `'${parentId}' in parents`,
    ].join(" and ")
  )}&fields=files(id,name)`;
  const res = await fetchWithAuth(url, accessToken);
  const names = new Set<string>();
  const ids = new Map<string, string>();
  if (res.ok) {
    const json = (await res.json()) as DriveListResponse;
    for (const f of json.files || []) { names.add(f.name); ids.set(f.name, f.id); }
  }

  for (const name of SUBFOLDERS) {
    if (!names.has(name)) {
      const folder = await createFolder(name, accessToken, parentId);
      await ensureAnyoneWriter(folder.id, accessToken);
    } else {
      const id = ids.get(name);
      if (id) await ensureAnyoneWriter(id, accessToken);
    }
  }
}

async function refreshAccessToken(refreshToken: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth not configured");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Failed to refresh token: ${res.status} ${t}`);
  }
  return (await res.json()) as { access_token: string; expires_in: number; refresh_token?: string };
}

export async function POST(request: Request) {
  try {
    // Allow internal calls (from Convex cron) by providing email in body
    const body = (await request.json()) as {
      clientId: string;
      email?: string; // optional for internal calls
      dateMs?: number; // optional override
    };

    if (!body?.clientId) {
      return NextResponse.json({ error: "clientId is required" }, { status: 400 });
    }

    let user = await getCurrentUser();
    const ownerEmail = body.email || user?.email;
    if (!ownerEmail) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!convex) {
      return NextResponse.json({ error: "Convex not configured" }, { status: 500 });
    }

    // Load client to get name
    const client = await convex.query(api.clients.getClientById, { clientId: body.clientId as any });
    if (!client || client.ownerEmail !== ownerEmail) {
      return NextResponse.json({ error: "Client not found or access denied" }, { status: 403 });
    }

    // Get organization for owner
    const org = await convex.query(api.organizations.getOrganizationForUser, { email: ownerEmail });
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 400 });
    }

    // Load Google Drive tokens for organization
    const cfg = await convex.query(api.googleDrive.getConfigForOrganization, { organizationId: org._id });
    if (!cfg?.accessToken || !cfg?.refreshToken) {
      return NextResponse.json({ error: "Google Drive not connected" }, { status: 400 });
    }

    let accessToken: string = cfg.accessToken;
    const now = Date.now();
    if (!cfg.tokenExpiry || cfg.tokenExpiry - 60000 < now) {
      // Refresh token
      try {
        const refreshed = await refreshAccessToken(cfg.refreshToken);
        accessToken = refreshed.access_token;
        const newExpiry = Date.now() + refreshed.expires_in * 1000;
        await convex.mutation(api.googleDrive.setTokensForOrganization, {
          organizationId: org._id,
          connectedByEmail: cfg.connectedByEmail,
          accessToken,
          refreshToken: refreshed.refresh_token || cfg.refreshToken,
          tokenExpiry: newExpiry,
          userEmail: cfg.userEmail,
          userName: cfg.userName,
        });
      } catch (err) {
        console.error("[Drive] Token refresh failed:", err);
        return NextResponse.json({ error: "Failed to refresh Google token" }, { status: 500 });
      }
    }

    // Ensure folders exist
    const clientFolder = await findOrCreateClientFolder(accessToken, ownerEmail, body.clientId, client.businessName);
    const dateMs = body.dateMs || now;
    const monthFolder = await findOrCreateMonthFolder(accessToken, clientFolder.id, ownerEmail, body.clientId, dateMs);
    await ensureSubfolders(accessToken, monthFolder.id);

    // Get month folder link
    const infoRes = await fetchWithAuth(
      `${DRIVE_API_BASE}/files/${monthFolder.id}?fields=id,name,webViewLink`,
      accessToken
    );
    const info = infoRes.ok ? await infoRes.json() : monthFolder;

    return NextResponse.json({
      success: true,
      clientFolderId: clientFolder.id,
      clientFolderName: clientFolder.name,
      monthFolderId: monthFolder.id,
      monthFolderName: monthFolder.name,
      monthFolderLink: info.webViewLink,
    });
  } catch (error) {
    console.error("[Drive] ensure folders error:", error);
    
    // Check if it's a Drive API not enabled error
    let errorMessage = "Failed to ensure drive folders";
    let errorCode = "drive_error";
    
    if (error instanceof Error) {
      const errorText = error.message;
      // Check for Drive API not enabled error
      if (errorText.includes("Google Drive API has not been used") || errorText.includes("SERVICE_DISABLED")) {
        errorMessage = "Google Drive API is not enabled. Please enable it in Google Cloud Console.";
        errorCode = "drive_api_disabled";
      } else if (errorText.includes("403")) {
        errorMessage = "Permission denied. Please check that Google Drive API is enabled and your OAuth scopes are correct.";
        errorCode = "drive_permission_denied";
      } else if (errorText.includes("401")) {
        errorMessage = "Authentication failed. Please reconnect your Google Drive account.";
        errorCode = "drive_auth_failed";
      }
    }
    
    return NextResponse.json({ 
      error: errorMessage,
      errorCode,
    }, { status: 500 });
  }
}
