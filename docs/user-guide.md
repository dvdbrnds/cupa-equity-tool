# CUPA Equity Tool — User Guide

For HR staff, analysts, and VP reviewers.

---

## Table of Contents

1. [Logging In](#logging-in)
2. [Dashboard Overview](#dashboard-overview)
3. [Importing Data](#importing-data)
4. [Running an Equity Analysis](#running-an-equity-analysis)
5. [Creating a Review Cycle](#creating-a-review-cycle)
6. [VP Review Workflow](#vp-review-workflow)
7. [PC Approval Workflow](#pc-approval-workflow)
8. [CUPA Catalog & AI Matching](#cupa-catalog--ai-matching)
9. [Position Management](#position-management)
10. [Review History & Export](#review-history--export)

---

## Logging In

Navigate to the app URL in your browser.

- **Local accounts:** Enter your email and password, then click **Sign In**.
- **Okta SSO:** Click **Sign in with Okta** and complete authentication through your institution's portal.

Your role determines what you can see and do:

| Role | Access |
|------|--------|
| System Admin | Everything |
| HR Admin | All HR features + user management |
| HR Analyst | All HR features, no user management |
| VP Reviewer | Your division only |
| Executive | Read-only, all divisions |
| Academic Dean | Read-only, your division |

---

## Dashboard Overview

The dashboard shows:

- **Setup checklist** — steps remaining before you can run an analysis (CUPA catalog loaded, positions imported, compensation data imported).
- **Active cycle banner** — if a review cycle is in progress, a link to it appears here.
- **Equity summary** — overall gap statistics across all divisions.
- **VP breakdown** — per-division summary of equity gaps and proposed raises.

---

## Importing Data

Go to **Import** in the navigation. All imports accept Excel (.xlsx) files.

### CUPA Catalog

Import the CUPA-HR position catalog. This is the reference data used for benchmarking.

- Expected columns: `CUPA Code`, `Title`, `Description`, `Category`, `BLS SOC Code`, `Population Type`, `Catalog Year`.
- This only needs to be done once per year when CUPA releases new data.

### Positions (Employee Roster)

Import your institutional positions. Each row is one employee.

- Required columns: `Employee ID`, `Employee Name`, `Institutional Title`, `Division`, `Department`, `VP Stem`.
- Optional: `CUPA Code` (if already classified), `Hire Date`, `FTE`, `Appointment Months`.
- Multi-sheet workbooks are supported; select the correct sheet if prompted.

### Compensation Data

Import current salary data. This is merged with existing position records by Employee ID (or name as fallback).

- Required columns: `Employee ID` (or name), `Current Salary` (or `Current Rate` for hourly employees).
- Hourly rates under $200/hour are auto-detected and annualized at 1,950 hours/year (37.5 hr/week).
- If a row cannot be matched to an existing position, a new position record is created.

### CUPA Salary Data

Import CUPA salary benchmarks for the current survey year.

- This data comes from your CUPA subscription (Multi Group Comparison format).
- Required: `CUPA Code`, `Median Salary`, plus optional percentile columns.

---

## Running an Equity Analysis

Once compensation and CUPA salary data are imported:

1. Go to **Review Cycles** and create a new cycle (or open an existing one in `draft` status).
2. On the cycle detail page, click **Run Equity Analysis** to calculate gaps.
3. The dashboard and division views will update with gap calculations.

**How gaps are calculated:**

- The CUPA median is adjusted for appointment months (10 vs 12 month), FTE, and years of service.
- The years-of-service adjustment assumes employees should reach the full adjusted median by year 5 (configurable).
- The equity gap = adjusted median − total compensation (salary + housing benefit if applicable).

---

## Creating a Review Cycle

HR Admin / HR Analyst roles only.

1. Go to **Review Cycles** → **New Cycle**.
2. Enter a name, fiscal year, and optional total budget.
3. Select the CUPA data year to use for benchmarking.
4. Click **Create**.

The cycle starts in `draft` status. From the cycle detail page you can:

- **Initialize Allocations** — distribute the total budget proportionally across VP divisions based on equity gaps.
- **Adjust allocations** — manually change any VP's allocated budget.
- **Send to VPs** — mark the cycle as ready for VP review; each VP's assigned email receives a notification.

---

## VP Review Workflow

VP Reviewers see only their division.

1. Log in — the dashboard shows any active cycles assigned to you.
2. Go to **My Review** or click the cycle link in the notification email.
3. Review each employee's proposed raise. You can:
   - Adjust individual raise amounts.
   - Use **Auto-Allocate** to distribute your budget proportionally across underpaid employees.
   - Use **Clear Raises** to reset all values.
4. Add notes if needed.
5. Click **Approve Review** to submit.

If you disagree with the approach, click **Request Changes** to flag the cycle for HR discussion.

**Supplemental funding:** If your allocated budget is insufficient, you can submit a supplemental funding request from the review page.

---

## PC Approval Workflow

Once all VPs have approved:

1. HR finalizes the cycle (reviews all VP submissions).
2. HR submits to the Provost's Committee (PC) via **Submit to PC**.
3. After the PC meeting, HR records the vote: **approved** or **rejected**.
4. If approved, HR ratifies the plan. The cycle moves to `approved` status and is ready for payroll implementation.

---

## CUPA Catalog & AI Matching

Go to **CUPA Catalog** in the navigation.

### Browse Tab

Search the full CUPA-HR catalog by code, title, or description. Click any row to see full details.

### AI Match Tab

Use AI to find the best CUPA classifications for a given job title or description.

1. Type a job title (e.g., "Director of Student Financial Services") or paste a job description.
2. Click **Find Matches** (or press ⌘↵).
3. The AI returns up to 5 ranked matches with confidence scores and a one-sentence explanation.
4. Click **Details** to see the full CUPA description.
5. Click **Assign** to assign the CUPA code directly to an existing position in the system.

**Note:** AI matching requires an OpenAI API key to be configured. Contact your administrator if you see a "not configured" error.

---

## Position Management

Go to **Positions** to see all employee position mappings.

- Filter by VP division, audit status, or search by name/title.
- Click **View** on any row to see full position details including equity data and raise history.
- On the detail page, you can see the CUPA mapping, compensation data, and a timeline of prior equity adjustments.

**Flagging positions:** VP reviewers can flag a position if the CUPA code appears incorrect. They can suggest an alternative code. HR will see the flag and can resolve it by assigning the correct code.

---

## Review History & Export

Go to **Review History** to see all completed cycles.

- Each card shows the cycle name, fiscal year, total proposed raises, and number of VP divisions.
- Click **View Details** to drill into a specific cycle.
- Click **Export Excel** (HR roles only) to download a two-sheet spreadsheet:
  - **Summary** — totals by VP division.
  - **Employee Detail** — one row per employee with salary, equity gap, and proposed raise.
