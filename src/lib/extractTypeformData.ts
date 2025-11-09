/**
 * Comprehensive extraction of data from Typeform responses
 * Attempts to extract all possible business/client information
 */

type TypeformAnswer = {
  field?: {
    id?: string;
    ref?: string;
    type?: string;
  };
  text?: string;
  type?: string;
  email?: string;
  phone_number?: string;
  number?: number;
  boolean?: boolean;
  date?: string;
  choice?: {
    label?: string;
  };
  choices?: Array<{
    label?: string;
  }>;
  [key: string]: unknown;
};

type TypeformPayload = {
  answers?: TypeformAnswer[];
  submitted_at?: string;
  response_id?: string;
  token?: string;
  metadata?: {
    browser?: string;
    platform?: string;
    referer?: string;
    network_id?: string;
    user_agent?: string;
  };
  variables?: Array<{
    key?: string;
    value?: string;
  }>;
  [key: string]: unknown;
};

export type ExtractedTypeformData = {
  // Basic info
  businessName: string | null;
  businessEmail: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  phoneNumber: string | null;
  
  // Dates
  submittedAt: string | null;
  responseId: string | null;
  
  // Financial
  targetRevenue: number | null;
  currentRevenue: number | null;
  budget: number | null;
  
  // Business details
  industry: string | null;
  businessType: string | null;
  website: string | null;
  location: string | null;
  companySize: string | null;
  
  // Additional fields (store all other answers)
  additionalFields: Record<string, unknown>;
};

/**
 * Extract comprehensive data from Typeform payload
 */
export function extractTypeformData(payload: TypeformPayload): ExtractedTypeformData {
  const result: ExtractedTypeformData = {
    businessName: null,
    businessEmail: null,
    contactFirstName: null,
    contactLastName: null,
    phoneNumber: null,
    submittedAt: payload.submitted_at || null,
    responseId: payload.response_id || payload.token || null,
    targetRevenue: null,
    currentRevenue: null,
    budget: null,
    industry: null,
    businessType: null,
    website: null,
    location: null,
    companySize: null,
    additionalFields: {},
  };

  if (!payload.answers || !Array.isArray(payload.answers)) {
    return result;
  }

  // Process each answer
  payload.answers.forEach((answer, index) => {
    const text = answer.text || "";
    const fieldRef = answer.field?.ref?.toLowerCase() || "";
    const fieldType = answer.field?.type || "";
    const answerType = answer.type || "";

    // Extract email
    if (answerType === "email" || fieldType === "email" || answer.email) {
      result.businessEmail = answer.email || text || null;
    } else if (text.includes("@")) {
      const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
      if (emailMatch && !result.businessEmail) {
        result.businessEmail = emailMatch[0];
      }
    }

    // Extract phone number
    if (answerType === "phone_number" || fieldType === "phone_number" || answer.phone_number) {
      result.phoneNumber = answer.phone_number || text || null;
    } else if (text.match(/[\d\s\-\(\)\+]{10,}/) && !result.phoneNumber) {
      result.phoneNumber = text.trim();
    }

    // Extract name (first answer is often name)
    if (index === 0 && text && !text.includes("@") && !text.match(/[\d\s\-\(\)\+]{10,}/)) {
      const nameParts = text.trim().split(/\s+/);
      if (nameParts.length >= 1 && !result.contactFirstName) {
        result.contactFirstName = nameParts[0];
      }
      if (nameParts.length >= 2 && !result.contactLastName) {
        result.contactLastName = nameParts.slice(1).join(" ");
      }
    }

    // Extract business name (second answer is often business name)
    if (index === 1 && text && !text.includes("@") && !text.match(/[\d\s\-\(\)\+]{10,}/)) {
      if (!result.businessName) {
        result.businessName = text.trim();
      }
    }

    // Extract revenue/budget numbers
    if (answerType === "number" || answer.number !== undefined) {
      const num = answer.number || parseInt(text.replace(/,/g, ""), 10);
      if (!isNaN(num) && num >= 1000) {
        const lowerText = text.toLowerCase();
        const lowerRef = fieldRef.toLowerCase();
        
        if (lowerText.includes("target") || lowerText.includes("goal") || lowerRef.includes("target") || lowerRef.includes("goal")) {
          if (!result.targetRevenue) result.targetRevenue = num;
        } else if (lowerText.includes("current") || lowerText.includes("existing") || lowerRef.includes("current")) {
          if (!result.currentRevenue) result.currentRevenue = num;
        } else if (lowerText.includes("budget") || lowerRef.includes("budget")) {
          if (!result.budget) result.budget = num;
        } else if (num >= 10000 && num <= 10000000 && !result.targetRevenue) {
          // Default to target revenue if it's a reasonable revenue number
          result.targetRevenue = num;
        }
      }
    }

    // Extract website
    if (text.match(/^https?:\/\//) || text.match(/^www\./) || fieldRef.includes("website") || fieldRef.includes("url")) {
      if (!result.website) {
        result.website = text.trim();
      }
    }

    // Extract industry/business type
    if (answer.choice?.label) {
      const label = answer.choice.label.toLowerCase();
      if (label.includes("industry") || fieldRef.includes("industry")) {
        result.industry = answer.choice.label;
      } else if (label.includes("type") || fieldRef.includes("type")) {
        result.businessType = answer.choice.label;
      } else if (label.includes("size") || fieldRef.includes("size")) {
        result.companySize = answer.choice.label;
      }
    }

    if (answer.choices && answer.choices.length > 0) {
      const labels = answer.choices.map(c => c.label).join(", ");
      const lowerRef = fieldRef.toLowerCase();
      if (lowerRef.includes("industry")) {
        result.industry = labels;
      } else if (lowerRef.includes("type")) {
        result.businessType = labels;
      }
    }

    // Extract location
    if (fieldRef.includes("location") || fieldRef.includes("address") || fieldRef.includes("city") || fieldRef.includes("state")) {
      if (!result.location && text) {
        result.location = text.trim();
      }
    }

    // Store all answers in additionalFields for manual review
    if (answer.field?.ref) {
      result.additionalFields[answer.field.ref] = {
        text: answer.text,
        type: answer.type,
        value: answer.email || answer.phone_number || answer.number || answer.boolean || answer.date || answer.choice || answer.choices || text,
      };
    }
  });

  // Check metadata for email
  if (!result.businessEmail && payload.metadata) {
    const metadata = payload.metadata as Record<string, unknown>;
    if (metadata.email && typeof metadata.email === "string") {
      result.businessEmail = metadata.email;
    }
  }

  // Check variables for additional info
  if (payload.variables && Array.isArray(payload.variables)) {
    payload.variables.forEach((variable) => {
      if (variable.key && variable.value) {
        const key = variable.key.toLowerCase();
        const value = String(variable.value);
        
        if (key.includes("email") && !result.businessEmail) {
          result.businessEmail = value;
        } else if (key.includes("name") && !result.contactFirstName) {
          const nameParts = value.split(/\s+/);
          if (nameParts.length >= 1) result.contactFirstName = nameParts[0];
          if (nameParts.length >= 2) result.contactLastName = nameParts.slice(1).join(" ");
        } else if (key.includes("business") && !result.businessName) {
          result.businessName = value;
        }
      }
    });
  }

  return result;
}

