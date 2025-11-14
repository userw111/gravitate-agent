# Clients Page Mockup Analysis

## Summary

This document identifies all **mockup/placeholder elements** on the clients page that are **not connected to real data or functionality**. The analysis covers both the main clients list page (`/dashboard`) and the individual client details page (`/dashboard/clients/[responseId]`).

---

## 🚨 MOCKUP ELEMENTS (Not Connected to Data)

### Main Dashboard (`/dashboard`)

#### ClientTile Component (`src/components/ClientTile.tsx`)
- ⚠️ **Next Script Date Calculation** (Line 27-32)
  - Uses hardcoded calculation: `createdAt + 7 days`
  - **Should use**: Actual `nextScheduledJob.scheduledTime` from cron jobs
  - **Status**: Fallback calculation, not true mockup but not using real data

- ⚠️ **Last Call Date** (Line 39)
  - Uses `client.createdAt` as fallback
  - **Should use**: Actual `transcripts[0].date` from Fireflies transcripts
  - **Status**: Fallback, not using real transcript data

---

### Client Details Page (`/dashboard/clients/[responseId]`)

#### Header Actions (Top of Page)
1. ❌ **"Generate Scripts Now" Button** (Line 658-660)
   - **Location**: Top header, appears before client info
   - **Status**: No `onClick` handler, completely non-functional
   - **Should connect to**: `api.clients.triggerScriptGeneration` action

2. ❌ **"Recalculate Dates" Button** (Line 661-663)
   - **Status**: No `onClick` handler, completely non-functional
   - **Should connect to**: Cron job recalculation logic

3. ❌ **"Open Drive Folder" Button** (Line 664-666)
   - **Status**: No `onClick` handler, completely non-functional
   - **Should connect to**: `/api/google-drive/create-folders` endpoint (already exists)

#### Client Overview Card (Left Column)
4. ❌ **Tags: "SaaS" and "B2B"** (Lines 892-898)
   - **Status**: Hardcoded badges, always displayed
   - **Should be**: Dynamic tags stored in `clients` table schema
   - **Data needed**: Add `tags: v.optional(v.array(v.string()))` to schema

#### Links & Assets Card (Left Column)
5. ❌ **Empty Card** (Lines 1031-1036)
   - **Status**: Card exists but has no content
   - **Should show**: Google Drive folder links
   - **Data available**: Can use `/api/google-drive/create-folders` endpoint

#### Overview Tab Content

6. ❌ **Readiness Card - Typeform Checkmark** (Lines 1117-1121)
   - **Status**: Always shows green checkmark, no actual validation
   - **Should check**: `typeformResponse` exists (already queried on line 211-216)
   - **Fix**: `typeformResponse ? "✅ Typeform" : "❌ No Typeform"`

7. ❌ **Readiness Card - Call Notes** (Lines 1123-1127)
   - **Status**: Hardcoded text "Call notes (Oct 28)" with static date
   - **Should show**: Actual latest transcript date from `transcripts[0]?.date`
   - **Data available**: `transcripts` already queried on line 219-224
   - **Fix**: `transcripts && transcripts.length > 0 ? \`✅ Call notes (${formatShortDate(transcripts[0].date)})\` : "❌ No call notes"`

8. ❌ **Readiness Card - Winning Angle** (Lines 1129-1133)
   - **Status**: Hardcoded "Winning angle (CTR 2.8%)" with fake metric
   - **Should calculate**: From actual script performance data
   - **Data needed**: Script performance tracking (CTR, opens, etc.) - not in schema yet

9. ❌ **"Generate Scripts Now" Button** (Line 1138-1140)
   - **Status**: No `onClick` handler (duplicate of header button)
   - **Should connect to**: `api.clients.triggerScriptGeneration` action

10. ❌ **"Preview Inputs" Button** (Line 1141-1143)
    - **Status**: No `onClick` handler, completely non-functional
    - **Would need**: New feature to preview script generation inputs

11. ❌ **Angles & Strategy Buttons** (Lines 1154-1162)
    - **Status**: Three hardcoded buttons with no functionality:
      - "New service"
      - "Social proof"
      - "Objection handling"
    - **Should be**: Toggle buttons that save selected angles to database
    - **Data needed**: Add `selectedAngles: v.optional(v.array(v.string()))` to schema

12. ❌ **Angle Notes Textarea** (Lines 1164-1167)
    - **Status**: No `onChange` handler, no save functionality
    - **Should save**: To `clients.angleNotes` field
    - **Data needed**: Add `angleNotes: v.optional(v.string())` to schema

13. ❌ **Recent Activity Card** (Lines 1172-1184)
    - **Status**: Hardcoded static text:
      - "Cadence set to +25d/4w by {email} • Today 9:14a"
      - "Error: Drive quota limit • View log"
    - **Should show**: Real activity log from `script_generation_runs` table
    - **Data needed**: Query filtered by `clientId` (need to create query)

#### Footer
14. ❌ **Footer Message** (Line 1531)
    - **Status**: Hardcoded static instructional text
    - **Should be**: Dynamic based on actual client state

#### Tabs
15. ❌ **Call Intelligence Tab** (Lines 1448-1509)
    - **Status**: Shows transcripts with notes, but tab name suggests analysis/insights
    - **Current**: Actually shows real transcript data (not mockup)
    - **Note**: Tab name might be misleading - it's functional but may need renaming

16. ❌ **History & Logs Tab** (Lines 1511-1524)
    - **Status**: Placeholder message "History & Logs content coming soon..."
    - **Should show**: Script generation runs, cron job executions, client updates
    - **Data available**: `script_generation_runs` table (need query filtered by clientId)

---

## ✅ REAL DATA ELEMENTS (Connected)

### Main Dashboard
- Client list from `api.clients.getAllClientsForOwner`
- Client status badges
- Business names, emails, contact names
- Search and filter functionality

### Client Details Page
- Client information (name, email, contact, revenue)
- Status and cadence controls (cron jobs)
- Next script date editor (connected to cron jobs)
- Scripts tab (real script data)
- Notes tab (saves to database)
- Transcripts tab (real Fireflies data)
- Edit client dialog (all fields save to database)
- Metric tiles (scripts generated, next script, last call, member since)

---

## 🔧 QUICK FIXES (No Schema Changes Required)

These can be connected immediately:

1. **Typeform Checkmark** - Use existing `typeformResponse` query
2. **Call Notes Checkmark** - Use existing `transcripts` query
3. **Open Drive Folder Button** - Use existing `/api/google-drive/create-folders`
4. **Generate Scripts Now Button** - Use existing `api.clients.triggerScriptGeneration`
5. **Links & Assets Card** - Use existing Drive folder endpoint
6. **History & Logs Tab** - Query `script_generation_runs` filtered by clientId

---

## 📋 SCHEMA CHANGES NEEDED

These require adding fields to the `clients` schema:

1. **Tags** - Add `tags: v.optional(v.array(v.string()))`
2. **Angle Notes** - Add `angleNotes: v.optional(v.string())`
3. **Selected Angles** - Add `selectedAngles: v.optional(v.array(v.string()))`

---

## 📊 STATISTICS

- **Total Mockup Elements**: 16
- **Non-Functional Buttons**: 5
- **Hardcoded Values**: 6
- **Empty/Placeholder Sections**: 3
- **Can Fix Immediately**: 6
- **Need Schema Changes**: 3
- **Require New Features**: 2

---

## 🎯 PRIORITY RECOMMENDATIONS

### High Priority (Easy Wins)
1. Connect "Generate Scripts Now" buttons
2. Connect "Open Drive Folder" button
3. Fix Typeform and Call Notes checkmarks
4. Populate Links & Assets card
5. Implement History & Logs tab

### Medium Priority (Schema Changes)
1. Add angle notes functionality
2. Make tags dynamic
3. Add selected angles tracking

### Low Priority (New Features)
1. Preview Inputs feature
2. Winning Angle metrics (requires performance tracking)
3. Recalculate Dates (may not be needed with fixed schedule)

