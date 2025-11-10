# Client Lookup Tool - Implementation Complete ✅

## Overview
A database lookup tool that allows the AI chat to search for clients by name, email, or business information. **Fully integrated and ready to use!**

## System Prompt Location

**📍 System Prompt**: `src/app/api/chat/route.ts` (lines 3-8)

The system prompt is defined as a constant at the top of the chat API route:
```typescript
const SYSTEM_PROMPT = `You are a helpful AI assistant for Gravitate Agent, a client management platform. You help users manage their clients, view transcripts, and access business information.

You have access to tools that can look up client information from the database. When users ask about clients, use the client_lookup tool to search for them by name, email, or business information.

Always be helpful, concise, and focus on providing actionable information.`;
```

The system prompt is automatically prepended to all conversations (unless a system message already exists).

## Implementation

### 1. Convex Query Function ✅
**File**: `convex/clients.ts`
- Added `searchClients` query function
- Searches clients by business name, email, or contact name
- Returns matching clients for the authenticated owner

### 2. API Route ✅
**File**: `src/app/api/tools/client-lookup/route.ts`
- POST endpoint: `/api/tools/client-lookup`
- Requires authentication
- Accepts `query` (string) and optional `limit` (number)
- Returns enriched client data including:
  - Basic client information
  - Transcript count
  - Last transcript date
  - Onboarding data availability

### 3. Chat API Integration ✅
**File**: `src/app/api/chat/route.ts`
- ✅ Added system prompt
- ✅ Added tool definitions (OpenRouter format)
- ✅ Handles `tool_calls` in streaming response
- ✅ Executes tool calls automatically
- ✅ Makes follow-up requests with tool results
- ✅ Streams final response back to client

### 4. ChatClient Updates ✅
**File**: `src/components/ChatClient.tsx`
- ✅ Handles `tool_call` events in the stream
- ✅ Displays tool usage with visual indicator
- ✅ Shows "Looking up client information..." when tool is called
- ✅ Handles `tool_result` events

## How It Works

1. **User asks a question** about clients (e.g., "Find clients named Acme")
2. **AI decides to use tool** - OpenRouter detects the need and calls `client_lookup`
3. **Tool execution** - Backend executes the tool call, searches the database
4. **Tool result** - Results are sent back to OpenRouter
5. **Final response** - AI processes the results and responds to the user

## Usage Examples

Users can now ask:
- "Find clients named Acme Corp"
- "Look up the client with email john@example.com"
- "Show me all active clients"
- "What clients have transcripts?"
- "Search for clients with 'tech' in their name"

The AI will automatically:
1. Recognize the need to search
2. Call the `client_lookup` tool
3. Process the results
4. Provide a helpful response

## Visual Indicators

- **Tool Call**: Blue badge showing "🔍 Using tool: client_lookup" with search query
- **Reasoning**: Gray box showing AI thinking process (for GPT-5 models)
- **Content**: Normal message display with markdown rendering

## Testing

To test the integration:
1. Start a chat conversation
2. Ask: "Find clients named [your client name]"
3. You should see:
   - Blue tool indicator showing the search
   - AI response with client information

## Security

- ✅ All API routes require authentication
- ✅ Tool calls are scoped to the authenticated user's data
- ✅ No sensitive data exposed in error messages

