const convexBaseUrl = (process.env.NEXT_PUBLIC_CONVEX_URL || "").replace(/\/$/, "");
const deploymentToken = process.env.CONVEX_DEPLOYMENT_TOKEN;

type ConvexCallType = "query" | "mutation" | "action";

type ConvexResponse<T> =
  | {
      status: "success";
      value: T;
      logLines?: string[];
    }
  | {
      status: "error";
      errorMessage: string;
      errorData?: unknown;
      logLines?: string[];
    };

function requireConfig() {
  if (!convexBaseUrl) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is not configured.");
  }
  if (!deploymentToken) {
    throw new Error("CONVEX_DEPLOYMENT_TOKEN is not configured.");
  }
}

async function callConvex<T>(
  type: ConvexCallType,
  path: string,
  args: Record<string, unknown> | undefined = {}
): Promise<T> {
  requireConfig();

  const endpoint = `${convexBaseUrl}/api/${type}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Convex ${deploymentToken}`,
    },
    body: JSON.stringify({
      path,
      args,
      format: "json",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Convex ${type} failed (${response.status} ${response.statusText}): ${text}`
    );
  }

  const data = (await response.json()) as ConvexResponse<T>;
  if (data.status !== "success") {
    throw new Error(
      data.errorMessage || `Convex ${type} ${path} returned an error`
    );
  }
  return data.value;
}

export async function convexQuery<T>(
  path: string,
  args?: Record<string, unknown>
) {
  return callConvex<T>("query", path, args);
}

export async function convexMutation<T>(
  path: string,
  args?: Record<string, unknown>
) {
  return callConvex<T>("mutation", path, args);
}

export async function convexAction<T>(
  path: string,
  args?: Record<string, unknown>
) {
  return callConvex<T>("action", path, args);
}

