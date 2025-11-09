/**
 * Utility functions for parsing Typeform response payloads
 */

type TypeformAnswer = {
  field: {
    id: string;
    ref: string;
    type: string;
  };
  text: string;
  type: string;
};

type TypeformPayload = {
  answers?: TypeformAnswer[];
  submitted_at?: string;
  response_id?: string;
  token?: string;
  [key: string]: unknown;
};

export type ClientInfo = {
  businessName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  submittedAt: string | null;
  responseId: string | null;
  targetRevenue: number | null;
};

/**
 * Extracts client information from a Typeform payload
 * Based on the form structure, we need to find:
 * - Business name (second answer typically)
 * - First and last name (first answer, split by space)
 * - Email (may be in answers or metadata)
 */
export function extractClientInfo(payload: TypeformPayload): ClientInfo {
  const result: ClientInfo = {
    businessName: null,
    firstName: null,
    lastName: null,
    email: null,
    submittedAt: payload.submitted_at || null,
    responseId: payload.response_id || payload.token || null,
    targetRevenue: null,
  };

  if (!payload.answers || !Array.isArray(payload.answers)) {
    return result;
  }

  // First answer is typically the name (e.g., "Braden Roushia")
  if (payload.answers[0]?.text) {
    const nameParts = payload.answers[0].text.trim().split(/\s+/);
    if (nameParts.length >= 1) {
      result.firstName = nameParts[0];
    }
    if (nameParts.length >= 2) {
      result.lastName = nameParts.slice(1).join(" ");
    }
  }

  // Second answer is typically the business name (e.g., "PureVue")
  if (payload.answers[1]?.text) {
    result.businessName = payload.answers[1].text.trim();
  }

  // Try to find email in answers (look for email-like text)
  for (const answer of payload.answers) {
    if (answer.text && answer.text.includes("@")) {
      // Simple email validation
      const emailMatch = answer.text.match(/[\w.-]+@[\w.-]+\.\w+/);
      if (emailMatch) {
        result.email = emailMatch[0];
        break;
      }
    }
  }

  // Also check metadata or other fields for email
  if (!result.email && (payload as { email?: string }).email) {
    result.email = (payload as { email: string }).email;
  }

  // Try to find target revenue in answers (look for large numbers that might be revenue)
  // Based on the example, revenue fields are typically around answer index 5-6
  for (const answer of payload.answers) {
    if (answer.text) {
      // Remove commas and try to parse as number
      const cleaned = answer.text.replace(/,/g, "").trim();
      const num = parseInt(cleaned, 10);
      // If it's a reasonable revenue number (between 10k and 10M)
      if (!isNaN(num) && num >= 10000 && num <= 10000000) {
        result.targetRevenue = num;
        break;
      }
    }
  }

  return result;
}

