import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexHttpClient(convexUrl) : null;

// Google Drive API helpers
const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const DOCS_API_BASE = "https://docs.googleapis.com/v1";
const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";

async function fetchWithAuth(url: string, accessToken: string, init?: RequestInit) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
  };
  if (init?.headers) {
    Object.assign(headers, init.headers as Record<string, string>);
  }
  return await fetch(url, { ...init, headers });
}

async function refreshAccessToken(refreshToken: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth credentials not configured");
  }

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
    const text = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${text}`);
  }

  return (await res.json()) as { access_token: string; expires_in: number; refresh_token?: string };
}

// Parse HTML and convert to Google Docs API format
interface TextSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
  heading?: "HEADING_1" | "HEADING_2" | "HEADING_3";
  link?: string;
  isParagraphBreak?: boolean;
  isLineBreak?: boolean;
}

interface FormattingState {
  bold: boolean;
  italic: boolean;
  heading?: "HEADING_1" | "HEADING_2" | "HEADING_3";
  link?: string;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—");
}

function parseHtmlToSegments(html: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const formatStack: FormattingState[] = [{ bold: false, italic: false }];
  
  // Normalize HTML - handle self-closing tags and common patterns
  let normalized = html
    .replace(/<br\s*\/?>/gi, "<br>")
    .replace(/<hr\s*\/?>/gi, "<hr>")
    .replace(/<img[^>]*>/gi, ""); // Remove images

  // Track paragraph breaks
  let needsParagraphBreak = false;
  
  // Parse using a more sophisticated approach
  let i = 0;
  let currentText = "";
  let currentFormat: FormattingState = { ...formatStack[formatStack.length - 1] };

  while (i < normalized.length) {
    if (normalized[i] === "<") {
      // Save any accumulated text
      if (currentText) {
        const decoded = decodeHtmlEntities(currentText);
        if (decoded.trim() || decoded.includes("\n")) {
          segments.push({
            text: decoded,
            bold: currentFormat.bold,
            italic: currentFormat.italic,
            heading: currentFormat.heading,
            link: currentFormat.link,
          });
        }
        currentText = "";
      }

      // Find the end of the tag
      const tagEnd = normalized.indexOf(">", i);
      if (tagEnd === -1) break;
      
      const tagContent = normalized.substring(i + 1, tagEnd);
      const isClosing = tagContent.startsWith("/");
      const tagMatch = tagContent.match(/^\/?([a-z][a-z0-9]*)/i);
      
      if (tagMatch) {
        const tagName = tagMatch[1].toLowerCase();
        const fullTag = normalized.substring(i, tagEnd + 1);

        if (isClosing) {
          // Handle closing tags
          if (tagName === "p" || tagName === "div") {
            needsParagraphBreak = true;
          } else if (tagName === "li") {
            needsParagraphBreak = true;
          } else if (tagName === "h1" || tagName === "h2" || tagName === "h3" || tagName === "h4" || tagName === "h5" || tagName === "h6") {
            needsParagraphBreak = true;
            // Pop formatting stack until we find the matching heading
            while (formatStack.length > 1 && formatStack[formatStack.length - 1].heading) {
              formatStack.pop();
            }
            currentFormat = { ...formatStack[formatStack.length - 1] };
          } else if (tagName === "strong" || tagName === "b") {
            // Pop bold from stack
            while (formatStack.length > 1 && formatStack[formatStack.length - 1].bold) {
              formatStack.pop();
            }
            currentFormat = { ...formatStack[formatStack.length - 1] };
          } else if (tagName === "em" || tagName === "i") {
            // Pop italic from stack
            while (formatStack.length > 1 && formatStack[formatStack.length - 1].italic) {
              formatStack.pop();
            }
            currentFormat = { ...formatStack[formatStack.length - 1] };
          } else if (tagName === "a") {
            // Pop link from stack
            while (formatStack.length > 1 && formatStack[formatStack.length - 1].link) {
              formatStack.pop();
            }
            currentFormat = { ...formatStack[formatStack.length - 1] };
          }
        } else {
          // Handle opening tags
          if (tagName === "br") {
            segments.push({ text: "\n", isLineBreak: true });
          } else if (tagName === "p" || tagName === "div") {
            if (needsParagraphBreak) {
              segments.push({ text: "\n", isParagraphBreak: true });
              needsParagraphBreak = false;
            }
          } else if (tagName === "h1") {
            if (needsParagraphBreak) {
              segments.push({ text: "\n", isParagraphBreak: true });
            }
            const newFormat: FormattingState = { ...currentFormat, heading: "HEADING_1" };
            formatStack.push(newFormat);
            currentFormat = newFormat;
            needsParagraphBreak = true;
          } else if (tagName === "h2") {
            if (needsParagraphBreak) {
              segments.push({ text: "\n", isParagraphBreak: true });
            }
            const newFormat: FormattingState = { ...currentFormat, heading: "HEADING_2" };
            formatStack.push(newFormat);
            currentFormat = newFormat;
            needsParagraphBreak = true;
          } else if (tagName === "h3") {
            if (needsParagraphBreak) {
              segments.push({ text: "\n", isParagraphBreak: true });
            }
            const newFormat: FormattingState = { ...currentFormat, heading: "HEADING_3" };
            formatStack.push(newFormat);
            currentFormat = newFormat;
            needsParagraphBreak = true;
          } else if (tagName === "strong" || tagName === "b") {
            const newFormat: FormattingState = { ...currentFormat, bold: true };
            formatStack.push(newFormat);
            currentFormat = newFormat;
          } else if (tagName === "em" || tagName === "i") {
            const newFormat: FormattingState = { ...currentFormat, italic: true };
            formatStack.push(newFormat);
            currentFormat = newFormat;
          } else if (tagName === "a") {
            const hrefMatch = fullTag.match(/href=["']([^"']+)["']/i);
            if (hrefMatch) {
              const newFormat: FormattingState = { ...currentFormat, link: hrefMatch[1] };
              formatStack.push(newFormat);
              currentFormat = newFormat;
            }
          } else if (tagName === "li") {
            segments.push({ text: "• ", bold: currentFormat.bold, italic: currentFormat.italic });
          }
        }
      }
      
      i = tagEnd + 1;
    } else {
      currentText += normalized[i];
      i++;
    }
  }

  // Add any remaining text
  if (currentText) {
    const decoded = decodeHtmlEntities(currentText);
    if (decoded.trim()) {
      segments.push({
        text: decoded,
        bold: currentFormat.bold,
        italic: currentFormat.italic,
        heading: currentFormat.heading,
        link: currentFormat.link,
      });
    }
  }

  // Filter out empty segments but keep line/paragraph breaks
  return segments.filter((s) => s.text || s.isLineBreak || s.isParagraphBreak);
}

function createGoogleDocsRequests(segments: TextSegment[]): any[] {
  const requests: any[] = [];
  let currentIndex = 1; // Google Docs indices start at 1

  for (const segment of segments) {
    // Handle paragraph/line breaks
    if (segment.isParagraphBreak || segment.isLineBreak) {
      const breakText = segment.isParagraphBreak ? "\n" : "\n";
      requests.push({
        insertText: {
          location: { index: currentIndex },
          text: breakText,
        },
      });
      currentIndex += breakText.length;
      continue;
    }

    if (!segment.text) continue;

    // Insert text
    requests.push({
      insertText: {
        location: { index: currentIndex },
        text: segment.text,
      },
    });

    const startIndex = currentIndex;
    const endIndex = currentIndex + segment.text.length;

    // Apply formatting if needed
    const hasTextFormatting = segment.bold || segment.italic || segment.link;
    const hasParagraphFormatting = segment.heading;

    if (hasTextFormatting) {
      const updateTextStyle: any = {
        range: {
          startIndex,
          endIndex,
        },
        textStyle: {},
        fields: "",
      };

      const fields: string[] = [];
      if (segment.bold) {
        updateTextStyle.textStyle.bold = true;
        fields.push("bold");
      }
      if (segment.italic) {
        updateTextStyle.textStyle.italic = true;
        fields.push("italic");
      }
      if (segment.link) {
        updateTextStyle.textStyle.link = { url: segment.link };
        fields.push("link");
      }

      if (fields.length > 0) {
        updateTextStyle.fields = fields.join(",");
        requests.push({
          updateTextStyle: updateTextStyle,
        });
      }
    }

    // Apply paragraph style for headings (must be separate request)
    if (hasParagraphFormatting) {
      requests.push({
        updateParagraphStyle: {
          range: {
            startIndex,
            endIndex,
          },
          paragraphStyle: {
            namedStyleType: segment.heading,
          },
          fields: "namedStyleType",
        },
      });
    }

    currentIndex = endIndex;
  }

  return requests;
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!convex) {
      return NextResponse.json({ error: "Convex not configured" }, { status: 500 });
    }

    const body = (await request.json()) as {
      title?: string;
      content: string; // HTML content
    };

    if (!body?.content) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    // Load Google Drive tokens
    const cfg = await convex.query(api.googleDrive.getConfigForEmail, { email: user.email });
    if (!cfg?.accessToken || !cfg?.refreshToken) {
      return NextResponse.json({ error: "Google Drive not connected" }, { status: 400 });
    }

    let accessToken = cfg.accessToken;
    const now = Date.now();
    if (!cfg.tokenExpiry || cfg.tokenExpiry - 60000 < now) {
      // Refresh token
      try {
        const refreshed = await refreshAccessToken(cfg.refreshToken);
        accessToken = refreshed.access_token;
        const newExpiry = Date.now() + refreshed.expires_in * 1000;
        await convex.mutation(api.googleDrive.setTokensForEmail, {
          email: user.email,
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

    // Approach A (preferred): Import original HTML via Drive multipart upload (Google will convert to Docs)
    // This preserves formatting closest to what Google Docs sees during paste.
    const boundary = "====multipart-boundary-" + Math.random().toString(36).slice(2);
    const metadata = {
      name: body.title || "New Document",
      mimeType: "application/vnd.google-apps.document",
    };
    const multipartBody =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: text/html; charset=UTF-8\r\n\r\n` +
      `${body.content}\r\n` +
      `--${boundary}--`;

    let createdDoc: { id: string; webViewLink?: string } | null = null;
    try {
      const uploadRes = await fetchWithAuth(
        `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,webViewLink`,
        accessToken,
        {
          method: "POST",
          headers: {
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body: multipartBody,
        }
      );
      if (uploadRes.ok) {
        createdDoc = (await uploadRes.json()) as { id: string; webViewLink?: string };
      } else {
        const text = await uploadRes.text();
        console.error(`[Drive] HTML import failed: ${uploadRes.status} ${text}`);
      }
    } catch (e) {
      console.error("[Drive] HTML import threw:", e);
    }

    // Fallback B: Create empty doc + Docs API batchUpdate (our HTML→Docs converter)
    if (!createdDoc) {
      const createRes = await fetchWithAuth(
        `${DRIVE_API_BASE}/files?fields=id,name,webViewLink`,
        accessToken,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: body.title || "New Document",
            mimeType: "application/vnd.google-apps.document",
          }),
        }
      );

      if (!createRes.ok) {
        const text = await createRes.text();
        throw new Error(`Failed to create document: ${createRes.status} ${text}`);
      }

      const doc = (await createRes.json()) as { id: string; webViewLink?: string };
      const documentId = doc.id;

      // Parse HTML and convert to Google Docs API format
      const segments = parseHtmlToSegments(body.content);
      const requests = createGoogleDocsRequests(segments);

      // Insert content with formatting into the document using Google Docs API
      const insertRes = await fetchWithAuth(
        `${DOCS_API_BASE}/documents/${documentId}:batchUpdate`,
        accessToken,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requests,
          }),
        }
      );

      if (!insertRes.ok) {
        const text = await insertRes.text();
        console.error(`Failed to insert text: ${insertRes.status} ${text}`);
        // Document was created, continue
      }

      const docUrl = doc.webViewLink || `https://docs.google.com/document/d/${documentId}/edit`;
      return NextResponse.json({
        success: true,
        documentId,
        url: docUrl,
      });
    }

    // Success via HTML import
    return NextResponse.json({
      success: true,
      documentId: createdDoc.id,
      url: createdDoc.webViewLink || `https://docs.google.com/document/d/${createdDoc.id}/edit`,
    });
  } catch (error) {
    console.error("[Drive] Create doc error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

