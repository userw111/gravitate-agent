# Clients Page Data Analysis

## Overview
This document lists all data displayed on the clients page (`/dashboard/clients/[responseId]`) and categorizes each item as either **Real Data** (linked to database/API) or **Mock Data** (hardcoded/placeholder).

---

## REAL DATA (Linked to Database/API)

### Client Overview Card (Left Column)
- ✅ **Client Name** (`client.businessName` or contact name) - from `clients` table
- ✅ **Status Badge** (`client.status`) - from `clients` table (active/paused/inactive)
- ✅ **Next Script Countdown** (`nextScheduledJob.scheduledTime`) - from `cron_jobs` table
- ✅ **Owner Email** (`email`) - from authenticated user
- ✅ **Business Email(s)** (`client.businessEmail`, `client.businessEmails`) - from `clients` table
- ✅ **Contact Name** (`client.contactFirstName`, `client.contactLastName`) - from `clients` table
- ✅ **Target Revenue** (`client.targetRevenue`) - from `clients` table
- ❌ **Tags (SaaS, B2B)** - HARDCODED (lines 798-804)

### Status & Cadence Card (Left Column)
- ✅ **Cron Job Enabled Toggle** (`client.cronJobEnabled`) - from `clients` table, updates via mutation
- ✅ **Fixed Schedule Display** - Shows actual schedule logic (immediate, +25d, +30d, monthly)
- ✅ **Recurring Monthly Day** (`cronJobs[].dayOfMonth`) - from `cron_jobs` table
- ✅ **Scheduled Jobs List** (`cronJobs[]`) - from `cron_jobs` table, filtered by status="scheduled"
- ✅ **Next Script Date Editor** (`nextScheduledJob.scheduledTime`) - from `cron_jobs` table, editable via `overrideNextRun` action
- ✅ **Skip Next Drop Checkbox** - calls `skipNextRun` action
- ✅ **Resume Schedule Toggle** - updates `client.cronJobEnabled` via mutation

### Key Dates Card (Left Column)
- ✅ **Row Created Date** (`client.createdAt`) - from `clients` table
- ✅ **Last Script Date** (`transcripts[0].date` or `submittedAt`) - from `fireflies.transcripts` table or typeform response

### Links & Assets Card (Left Column)
- ❌ **Empty Card** - No content, placeholder only

### Metric Tiles (Top Right)
- ✅ **Scripts Generated** (`scriptCount`) - from `scripts` table via `getScriptCountForClient` query
- ✅ **Next Script** (`nextScriptDateIso`) - from `nextScheduledJob.scheduledTime` or calculated fallback
- ✅ **Last Call** (`lastCallDate`) - from `transcripts[0].date` or fallback to `submittedAt`
- ✅ **Member Since** (`memberSinceDate`) - from `client.createdAt`

### Overview Tab Content
- ✅ **Next Script Due Date** (`nextScriptDateIso`) - from `nextScheduledJob.scheduledTime`
- ❌ **Typeform Checkmark** - HARDCODED (always shows green checkmark, line 1027)
- ❌ **Call Notes Checkmark** - HARDCODED (shows "Call notes (Oct 28)" - static date, line 1033)
- ❌ **Winning Angle Checkmark** - HARDCODED (shows "Winning angle (CTR 2.8%)" - static data, line 1039)
- ❌ **Generate Scripts Now Button** - NO FUNCTIONALITY (lines 1044-1046, 564-566)
- ❌ **Preview Inputs Button** - NO FUNCTIONALITY (line 1048)
- ❌ **Angles & Strategy Buttons** - HARDCODED (New service, Social proof, Objection handling - lines 1060-1068)
- ❌ **Angle Notes Textarea** - NO FUNCTIONALITY (lines 1070-1073, not connected to any data)
- ❌ **Recent Activity** - HARDCODED (shows static text "Cadence set to +25d/4w by {email} • Today 9:14a" and "Error: Drive quota limit • View log" - lines 1082-1087)

### Scripts Tab
- ✅ **All Script Data** - Real data from `scripts` table via `ScriptTabContent` component
- ✅ **Script Content** - Editable, saved to database
- ✅ **Script Metadata** - Dates, creation times, etc. all from database

### Notes Tab
- ✅ **Client Notes** (`client.notes`) - from `clients` table
- ✅ **Auto-save Functionality** - Updates `clients` table via `updateClient` mutation

### Transcripts Tab
- ✅ **Transcripts List** - Real data from `fireflies.transcripts` table via `UnlinkedTranscripts` component

### Call Intelligence Tab
- ❌ **Placeholder** - "Call Intelligence content coming soon..." (line 1158-1164)

### History & Logs Tab
- ❌ **Placeholder** - "History & Logs content coming soon..." (line 1158-1164)

### Header Actions (Top of Page)
- ❌ **Generate Scripts Now Button** - NO FUNCTIONALITY (line 564-566)
- ❌ **Recalculate Dates Button** - NO FUNCTIONALITY (line 567-569)
- ❌ **Open Drive Folder Button** - NO FUNCTIONALITY (line 570-572)

### Edit Client Dialog
- ✅ **All Form Fields** - Connected to `client` data and `updateClient` mutation:
  - Business name
  - Business emails (array)
  - Contact first/last name
  - Target revenue
  - Status

### Footer
- ❌ **Footer Message** - HARDCODED static text (lines 1170-1173)

---

## MOCK DATA (Hardcoded/Placeholder)

### Hardcoded Values
1. **Tags**: "SaaS" and "B2B" badges (lines 798-804)
2. **Readiness Card Checkmarks**: 
   - Typeform (always green, no actual check)
   - Call notes with static date "Oct 28"
   - Winning angle with static CTR "2.8%"
3. **Angles & Strategy Buttons**: "New service", "Social proof", "Objection handling" (not connected to any data)
4. **Recent Activity**: Static activity log entries
5. **Footer Message**: Static instructional text

### Non-Functional Buttons
1. **Generate Scripts Now** (appears twice: header and overview tab)
2. **Recalculate Dates**
3. **Open Drive Folder**
4. **Preview Inputs**

### Empty/Placeholder Sections
1. **Links & Assets Card** - Empty card with no content
2. **Call Intelligence Tab** - Placeholder message
3. **History & Logs Tab** - Placeholder message
4. **Angle Notes Textarea** - No save functionality, not connected to database

---

## POTENTIAL ADDITIONS

### Data That Could Be Added
1. **Typeform Response Status** - Check if typeform response exists and show actual status
2. **Call Notes from Transcripts** - Extract and display actual call notes from transcripts
3. **Winning Angle Metrics** - Calculate CTR or other metrics from actual script performance data
4. **Activity Log** - Real activity log from database (script generations, updates, etc.)
5. **Drive Folder Links** - Actual Google Drive folder links (partially implemented in ScriptTabContent)
6. **Angle Notes** - Store and retrieve angle notes from database
7. **Script Performance Metrics** - Track and display actual script performance data
8. **Client Tags** - Make tags dynamic and stored in database
9. **Recent Scripts Preview** - Show preview of recent scripts in overview
10. **Client Health Score** - Calculate based on engagement, script generation frequency, etc.

### Functionality That Could Be Added
1. **Generate Scripts Now** - Connect to script generation workflow
2. **Recalculate Dates** - Recalculate cron job schedule
3. **Open Drive Folder** - Link to actual Google Drive folder
4. **Preview Inputs** - Show what data will be used for next script generation
5. **Angle Notes Save** - Save angle notes to database
6. **Angles & Strategy** - Make buttons functional, store selected angles
7. **Activity Log View** - Link to actual log viewer
8. **Client Tags Management** - Add/edit/remove tags

---

## POTENTIAL SUBTRACTIONS

### Items That Could Be Removed
1. **Empty Links & Assets Card** - Remove if not planning to use
2. **Placeholder Tabs** - Remove "Call Intelligence" and "History & Logs" tabs if not planning to implement soon
3. **Mock Readiness Checkmarks** - Remove or replace with real checks
4. **Static Recent Activity** - Remove or replace with real activity log
5. **Footer Message** - Remove if not needed or make dynamic based on actual state
6. **Non-functional Buttons** - Remove "Generate Scripts Now" duplicates, "Recalculate Dates", "Open Drive Folder" if not implementing soon
7. **Hardcoded Tags** - Remove SaaS/B2B tags if not making them dynamic

---

## WHAT CAN BE CONNECTED TO DATA RIGHT NOW

Based on available queries, mutations, and data in the codebase, here's what can be connected immediately:

### ✅ EASY WINS (Data Already Available)

1. **Typeform Checkmark** (Overview Tab)
   - **Current**: Always shows green checkmark
   - **Can Connect**: Check if `typeformResponse` exists (already queried on line 211-216)
   - **Implementation**: `typeformResponse ? "✅ Typeform" : "❌ No Typeform"`
   - **Data Source**: `api.typeform.getResponseByResponseId` query (already exists)

2. **Call Notes Checkmark** (Overview Tab)
   - **Current**: Shows hardcoded "Call notes (Oct 28)"
   - **Can Connect**: Show actual latest transcript date
   - **Implementation**: Use `transcripts[0]?.date` (already queried on line 219-224)
   - **Data Source**: `api.fireflies.getTranscriptsForClient` query (already exists)
   - **Display**: `transcripts && transcripts.length > 0 ? `✅ Call notes (${formatShortDate(transcripts[0].date)})` : "❌ No call notes"`

3. **Recent Activity** (Overview Tab)
   - **Current**: Hardcoded "Cadence set to +25d/4w by {email} • Today 9:14a"
   - **Can Connect**: Use `script_generation_runs` table
   - **Implementation**: Query `api.scriptGeneration.listRecentRuns` filtered by `clientId`
   - **Data Source**: `script_generation_runs` table with `clientId` field
   - **Display**: Show recent script generation runs, cron job executions, client updates
   - **Note**: Need to add a query `getRecentRunsForClient(clientId)` or filter existing query

4. **Open Drive Folder Button** (Header)
   - **Current**: No functionality
   - **Can Connect**: Use existing `/api/google-drive/create-folders` endpoint
   - **Implementation**: Call the endpoint (already implemented in `ScriptTabContent.tsx` lines 87-118)
   - **Data Source**: Google Drive API via existing route
   - **Display**: Open `monthFolderLink` in new tab

5. **Generate Scripts Now Button** (Header & Overview)
   - **Current**: No functionality
   - **Can Connect**: Use `api.clients.triggerScriptGeneration` action
   - **Implementation**: Call action with `clientId` and `ownerEmail`
   - **Data Source**: Existing action in `convex/clients.ts` (line 488)
   - **Note**: May need to check if it works for manual triggers vs cron

6. **Links & Assets Card** (Left Column)
   - **Current**: Empty
   - **Can Connect**: Show Google Drive folder links
   - **Implementation**: Use same logic as `ScriptTabContent` to get/create folders
   - **Data Source**: `/api/google-drive/create-folders` endpoint
   - **Display**: Show client folder link, month folder links

7. **History & Logs Tab**
   - **Current**: Placeholder
   - **Can Connect**: Show `script_generation_runs` for this client
   - **Implementation**: Query runs filtered by `clientId`
   - **Data Source**: `script_generation_runs` table
   - **Display**: List of script generation runs with status, timestamps, errors

### ⚠️ MEDIUM EFFORT (Requires Schema Changes or New Queries)

8. **Angle Notes Textarea** (Overview Tab)
   - **Current**: No save functionality
   - **Can Connect**: Add `angleNotes` field to `clients` schema
   - **Implementation**: 
     - Add `angleNotes: v.optional(v.string())` to schema
     - Update `updateClient` mutation to handle it
     - Save on change (similar to notes)
   - **Data Source**: New field in `clients` table

9. **Angles & Strategy Buttons** (Overview Tab)
   - **Current**: Hardcoded buttons
   - **Can Connect**: Store selected angles in client record
   - **Implementation**: 
     - Add `selectedAngles: v.optional(v.array(v.string()))` to schema
     - Make buttons toggle selected state
     - Save to database
   - **Data Source**: New field in `clients` table

10. **Client Tags** (Overview Card)
    - **Current**: Hardcoded "SaaS", "B2B"
    - **Can Connect**: Store tags in client record
    - **Implementation**: 
      - Add `tags: v.optional(v.array(v.string()))` to schema
      - Allow editing in Edit Client dialog
      - Display dynamically
    - **Data Source**: New field in `clients` table

11. **Winning Angle Checkmark** (Overview Tab)
    - **Current**: Hardcoded "Winning angle (CTR 2.8%)"
    - **Can Connect**: Calculate from script performance (if tracked)
    - **Implementation**: 
      - Need to track script performance metrics (CTR, opens, etc.)
      - Calculate best performing angle
      - **Note**: Requires tracking script performance data (not currently in schema)

### ❌ NOT POSSIBLE YET (Requires New Features)

12. **Preview Inputs Button**
    - Would need to show what data will be used for next script generation
    - Requires building a preview function that aggregates:
      - Typeform response data
      - Recent transcripts
      - Client notes
      - Angle notes
    - **Effort**: Medium-High (new feature)

13. **Recalculate Dates Button**
    - Would need to recalculate cron job schedule
    - **Note**: Schedule is fixed (25d, 30d, monthly), so this might not be needed
    - Could be used to regenerate cron jobs if they were deleted

14. **Call Intelligence Tab**
    - Would need to analyze transcripts for insights
    - **Note**: Transcripts are available, but analysis/insights would need to be built

### 📋 QUICK REFERENCE: Available Queries/Mutations

**Already Available:**
- ✅ `api.typeform.getResponseByResponseId` - Check if typeform exists
- ✅ `api.fireflies.getTranscriptsForClient` - Get transcripts (already used)
- ✅ `api.scriptGeneration.listRecentRuns` - Get script generation runs (needs filtering by clientId)
- ✅ `api.googleDrive.getConfigForEmail` - Check Drive connection
- ✅ `/api/google-drive/create-folders` - Get/create Drive folders
- ✅ `api.clients.triggerScriptGeneration` - Trigger script generation
- ✅ `api.clients.updateClient` - Update client (can add new fields)

**Need to Create:**
- ⚠️ `api.scriptGeneration.getRecentRunsForClient` - Filter runs by clientId
- ⚠️ `api.clients.getDriveFolderLink` - Get stored Drive folder link (or use create-folders)

---

## SUMMARY

**Real Data Items**: ~25-30 items
**Mock Data Items**: ~15-20 items
**Non-Functional Elements**: ~8-10 buttons/features

**Can Connect Immediately (No Schema Changes):**
- Typeform checkmark ✅
- Call notes checkmark ✅
- Recent Activity ✅ (needs new query)
- Open Drive Folder button ✅
- Generate Scripts Now button ✅
- Links & Assets card ✅
- History & Logs tab ✅ (needs new query)

**Can Connect with Schema Changes:**
- Angle Notes textarea
- Angles & Strategy buttons
- Client Tags

**Cannot Connect Yet:**
- Preview Inputs (needs new feature)
- Winning Angle metrics (needs performance tracking)
- Call Intelligence (needs analysis feature)

The page has a solid foundation of real data, and **7 items can be connected immediately** without any schema changes!

