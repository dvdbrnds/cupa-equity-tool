# CUPA Position & Equity Analysis Tool

## Product Requirements Document (PRD)

**Version:** 2.0
**Date:** February 4, 2026
**Status:** Draft
**Author:** Moravian University HR Technology Team

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Goals & Success Criteria](#3-goals--success-criteria)
4. [Target Users & Personas](#4-target-users--personas)
5. [Product Overview](#5-product-overview)
6. [Feature Requirements](#6-feature-requirements)
7. [Data Architecture](#7-data-architecture)
8. [Technology Stack](#8-technology-stack)
9. [System Architecture](#9-system-architecture)
10. [User Workflows](#10-user-workflows)
11. [UI/UX Requirements](#11-uiux-requirements)
12. [Security & Access Control](#12-security--access-control)
13. [Implementation Phases](#13-implementation-phases)
14. [Success Metrics & KPIs](#14-success-metrics--kpis)
15. [Risks & Mitigations](#15-risks--mitigations)
16. [Future Considerations](#16-future-considerations)
17. [Appendices](#17-appendices)

---

## 1. Executive Summary

The CUPA Position & Equity Analysis Tool is a full-stack web application designed for higher education institutions to manage the end-to-end process of mapping institutional positions to standardized CUPA-HR (College and University Professional Association for Human Resources) classifications, constructing market-informed salary bands, and conducting rigorous compensation equity analysis.

The tool replaces the current manual, spreadsheet-driven audit process — where HR maintains a master Excel workbook with individual tabs assigned to each Vice President for position review — with an interactive, role-based application that supports structured workflows, real-time dashboards, and transparent salary band visualization.

The primary value proposition centers on **salary equity**. By anchoring position classifications to CUPA benchmarks and layering institutional compensation data on top, the tool enables HR teams to construct defensible salary bands, identify pay gaps, detect compression, and model the cost of equity adjustments — across both **staff and faculty** populations.

---

## 2. Problem Statement

Higher education institutions face compounding challenges in compensation management:

**2.1 Manual, Error-Prone Classification Process**
Moravian University currently maintains a single Excel workbook (`202324_CUPA_Audit_Position_Descriptions.xlsx`) containing a master reference sheet of ~777 standardized CUPA position descriptions and 10 senior-leader-specific tabs mapping ~352 institutional positions. Each tab — organized by senior leadership role (Provost, EVP for University Life, VP for Finance, etc.) — uses VLOOKUP formulas to pull CUPA titles and descriptions from the master sheet. This process is fragile — broken formulas, version conflicts, and lack of audit trails are endemic. There is no structured mechanism for senior leaders to confirm, dispute, or annotate their position classifications.

**2.2 Disconnected Salary Benchmarking**
Even after positions are classified, the link between a CUPA code and actionable salary data is manual. HR must separately pull CUPA-HR survey results, align them with institutional positions, and construct salary ranges in yet another spreadsheet. This disconnect means salary bands are often stale, inconsistently applied, or missing entirely for certain position categories.

**2.3 Equity Analysis Is Reactive, Not Systematic**
Without an integrated tool, equity analysis happens in response to complaints or during periodic audits rather than as a continuous, institution-wide practice. Identifying systemic patterns — compression between ranks, demographic pay gaps, or misaligned market positioning — requires assembling data from multiple disconnected sources.

**2.4 Faculty and Staff Treated as Separate Universes**
Faculty compensation involves unique dimensions (academic rank, discipline-specific markets, tenure status, multi-group benchmarking) that staff compensation does not. The current process has no unified framework for analyzing both populations under a single institutional equity lens, despite shared budgetary and strategic considerations.

**2.5 Lack of Transparency and Governance**
The spreadsheet-based process offers no visibility into who reviewed what, when, or what decisions were made. There is no approval workflow, no comment history, and no way for leadership to see audit progress in real time.

---

## 3. Goals & Success Criteria

### Primary Goals

1. **Digitize the CUPA position audit workflow** — Replace the Excel-based VP review process with role-based task assignment, structured review, and approval tracking.
2. **Build integrated salary bands** — Enable HR to construct, visualize, and maintain salary bands anchored to CUPA benchmarks for all staff and faculty positions.
3. **Surface equity insights** — Provide continuous, institution-wide visibility into pay equity through compa-ratio analysis, demographic overlays, compression detection, and market alignment scoring.
4. **Unify faculty and staff analysis** — Support both populations in a single tool with appropriate accommodation for their structural differences.

### Success Criteria

| Metric | Target | Timeframe |
|--------|--------|-----------|
| Position classification completion rate | 100% of active positions mapped to CUPA codes | Within 60 days of launch |
| VP audit cycle time | Reduce from ~8 weeks to ≤3 weeks | Year 1 |
| Salary band coverage | 100% of positions placed in published salary bands | Within 90 days of launch |
| Equity issues identified and documented | Baseline established in Year 1 | Ongoing quarterly |
| User adoption (HR + VPs) | 90%+ active monthly users | Within 6 months |

---

## 4. Target Users & Personas

### 4.1 HR Compensation Administrator (Primary)

**Role:** Manages the full audit cycle, constructs salary bands, runs equity analyses, and generates reports for leadership.

**Needs:** Full read/write access to all positions, the ability to assign review tasks to VPs, import CUPA survey data, configure salary bands, and produce audit-ready reports.

**Current pain point:** Maintaining the master Excel workbook, manually chasing VPs for review, and assembling equity data from multiple sources.

### 4.2 Vice President / Division Head (Key Reviewer)

**Role:** Reviews and validates position classifications for all positions within their division. The organizational structure is defined by **position/role**, not by the individual currently in the seat. As of the 2023–24 audit, the following senior leadership positions each own a segment of the institutional position inventory:

| Senior Leadership Position | Division(s) | Approx. Positions |
|---------------------------|-------------|-------------------|
| President and CEO | Cross-divisional senior leadership (President's Cabinet) | 10 |
| Provost, VP for Academic Affairs, CAO | Academic Programs, Registrar, Library, Center for Academic Excellence, Advising, and academic departments (Nursing, Business, Psychology, Biology, etc.) | 56 |
| Executive VP for University Life, COO | Student Life, Athletics & Recreation, Human Resources, Campus Police, Counseling, Conference & Event Mgmt, Accessibility Services, Veteran Services, Career & Civic Engagement, Religious & Spiritual Life, Compliance/Training | 113 |
| VP for Finance & Administration, CFO | Finance & Administration, Business Office, Student Accounts, FMPC, Mail Services | 73 |
| VP for Enrollment and Marketing | Admissions, Marketing & Communications, Financial Aid, Graduate & Adult Enrollment | 32 |
| VP for Development and Alumni Engagement | Development | 22 |
| VP and Chief Information Officer | Information Technology | 15 |
| Seminary Dean | Seminary / LTS | 14 |
| Chief Innovation Officer / Managing Director, SPSI | School of Professional Studies & Innovation, Institutional Research, University Partnerships | 11 |
| VP & Dean for Equity and Inclusion, CDO | Diversity, Equity & Inclusion; Intercultural Advancement & Global Inclusion | 6 |

*Note: Position titles and divisional assignments are configurable in the system and will be updated as the organizational structure evolves. The individuals occupying these roles change over time — the tool tracks the role, not the person.*

**Needs:** A focused view of only the positions under their purview. The ability to confirm, flag, or comment on classifications. Visibility into which positions still need their review.

**Current pain point:** Receiving an Excel tab with VLOOKUP formulas and no clear instructions on what action is needed or when.

### 4.3 CHRO / VP of Human Resources

**Role:** Strategic oversight of institutional compensation philosophy, equity posture, and compliance.

**Needs:** Executive dashboards showing audit progress, salary band health, equity risk indicators, and market competitiveness summaries. Does not need to edit individual positions.

### 4.4 Academic Dean / Department Chair (Faculty Context)

**Role:** Reviews faculty position classifications within their school or department, particularly relevant for discipline-specific market analysis.

**Needs:** View of faculty positions in their area, ability to annotate discipline-specific context, and visibility into how their faculty compensation compares to benchmark groups.

### 4.5 System Administrator

**Role:** Manages user accounts, configures Okta SSO integration, and maintains system settings.

**Needs:** User provisioning, role assignment, system configuration, and monitoring.

---

## 5. Product Overview

The CUPA Position & Equity Analysis Tool is a web-based application with four interconnected functional areas:

### 5.1 Position Classification Engine

The master reference catalog of CUPA-HR position descriptions (currently ~777 standardized positions across 6 major categories), against which institutional positions are mapped. Supports both the CUPA administrative/professional taxonomy and the CUPA faculty taxonomy.

**CUPA Staff/Administrative Categories:**

| Category | Code Range |
|----------|-----------|
| Top Executive Officers | 100000–105000 |
| Senior Institutional & Chief Functional Officers | 106000–145000 |
| Academic Deans | 153010–155010 |
| Institutional Administrators | 161000–187020 |
| Heads of Divisions, Departments & Centers | 190010–196500; 301030–301070 |
| Academic Associate and Assistant Deans | 304010–304410 |

**CUPA Faculty Categories:**

| Dimension | Values |
|-----------|--------|
| Track | Tenure-Track, Non-Tenure-Track |
| Rank | Professor, Associate Professor, Assistant Professor, Instructor, Lecturer |
| Discipline | CIP-code-based (e.g., Business, Nursing, Psychology, Biology, etc.) |
| Benchmark Groups | Budget peers, Student FTE peers, Landmark institutions, NACU, Faculty FTE peers, All institutions |

### 5.2 Audit Workflow Manager

Task assignment, review tracking, and approval workflows that replace the current VP-tab-in-a-spreadsheet model. HR assigns positions to reviewers, reviewers confirm or flag, HR resolves flags, and the audit cycle closes with a documented trail.

### 5.3 Salary Band Builder

The core equity engine. Ingests CUPA benchmark survey data, enables HR to define band structures (minimum, midpoint, maximum) for each position classification, and maps every employee to their appropriate band. Supports configurable band widths, multiple benchmark source weighting, and faculty-specific discipline/rank band matrices.

### 5.4 Equity Analysis Dashboard

Visualization and reporting layer that overlays actual institutional compensation data on the salary band structure. Surfaces compa-ratios, identifies outliers (below minimum / above maximum), detects compression patterns, and supports demographic equity analysis.

---

## 6. Feature Requirements

### 6.1 Position Classification & Management

**6.1.1 Master CUPA Reference Library**

| Requirement | Priority | Description |
|-------------|----------|-------------|
| REQ-PC-001 | P0 | Import and store the full CUPA-HR position description catalog with position number, title, description, BLS SOC code, and SOC category name |
| REQ-PC-002 | P0 | Support both staff/administrative and faculty CUPA taxonomies as separate but unified catalogs |
| REQ-PC-003 | P1 | Full-text search across position descriptions with filters by category, code range, and SOC code |
| REQ-PC-004 | P1 | Version the CUPA catalog by survey year (e.g., 2023–24, 2024–25) to support historical comparison |
| REQ-PC-005 | P2 | Highlight changes between CUPA catalog versions (new positions, retired positions, description changes) |

**6.1.2 Institutional Position Mapping**

| Requirement | Priority | Description |
|-------------|----------|-------------|
| REQ-PM-001 | P0 | Create and maintain institutional positions with fields: Employee ID, institutional job title, employee name, division, department, supervisor, and VP stem |
| REQ-PM-002 | P0 | Map each institutional position to one CUPA code (many-to-one: multiple employees may share a CUPA code) |
| REQ-PM-003 | P0 | Bulk import institutional positions from Excel/CSV files matching the current spreadsheet structure (primary data source until Oracle HCM integration in Phase 5) |
| REQ-PM-004 | P1 | Display the CUPA title and description alongside the institutional title for comparison during review |
| REQ-PM-005 | P1 | Track mapping history — log who mapped a position, when, and any previous CUPA code assignments |
| REQ-PM-006 | P2 | AI-assisted mapping suggestions based on institutional job title similarity to CUPA descriptions |

### 6.2 Audit Workflow

**6.2.1 Audit Cycle Management**

| Requirement | Priority | Description |
|-------------|----------|-------------|
| REQ-AW-001 | P0 | Create named audit cycles (e.g., "2024–25 Annual CUPA Audit") with start/end dates and status tracking |
| REQ-AW-002 | P0 | Assign positions to VP reviewers in bulk, based on division/VP-stem hierarchy |
| REQ-AW-003 | P0 | Track per-position review status: Pending, Under Review, Confirmed, Flagged, Resolved |
| REQ-AW-004 | P1 | Notification system (in-app + email) to alert VPs of pending reviews and approaching deadlines |
| REQ-AW-005 | P1 | Comment/annotation thread on each position for dialogue between reviewer and HR |
| REQ-AW-006 | P1 | Dashboard view showing overall audit progress by VP, division, and status |
| REQ-AW-007 | P2 | Configurable escalation rules (e.g., auto-remind after 7 days, escalate to CHRO after 14 days) |

**6.2.2 VP Review Interface**

| Requirement | Priority | Description |
|-------------|----------|-------------|
| REQ-VR-001 | P0 | Filtered view showing only positions assigned to the logged-in VP |
| REQ-VR-002 | P0 | For each position: display institutional title, employee name, department, current CUPA mapping, CUPA title, and CUPA description side-by-side |
| REQ-VR-003 | P0 | One-click Confirm or Flag action for each position |
| REQ-VR-004 | P1 | When flagging: require a reason (dropdown + free text) — options include "Wrong CUPA code," "Job duties changed," "Position eliminated," "New position needs mapping," "Other" |
| REQ-VR-005 | P1 | Ability to suggest an alternative CUPA code when flagging, with search/browse of the CUPA catalog |
| REQ-VR-006 | P2 | Batch confirm for positions the VP has no concerns about |

### 6.3 Salary Band Builder (Core Equity Engine)

**6.3.1 Benchmark Data Management**

| Requirement | Priority | Description |
|-------------|----------|-------------|
| REQ-SB-001 | P0 | Import CUPA-HR survey data (salary percentiles by CUPA code) from Excel/CSV |
| REQ-SB-002 | P0 | Support multiple benchmark sources per position (e.g., Budget peers, Student FTE peers, NACU, Landmark, Faculty FTE peers, All institutions) |
| REQ-SB-003 | P1 | Store benchmark data by survey year for longitudinal analysis |
| REQ-SB-004 | P1 | Configurable weighting across benchmark groups to create composite benchmarks (e.g., 40% Budget peers + 30% NACU + 30% Landmark) |
| REQ-SB-005 | P2 | Automated import pipeline for recurring CUPA-HR data loads |

**6.3.2 Band Construction**

| Requirement | Priority | Description |
|-------------|----------|-------------|
| REQ-BC-001 | P0 | Define salary bands with minimum, midpoint, and maximum for each CUPA code or band grouping |
| REQ-BC-002 | P0 | Support configurable band width methodology (e.g., ±15% of midpoint, ±20%, or asymmetric bands) |
| REQ-BC-003 | P0 | Auto-generate band proposals from benchmark data (e.g., midpoint = weighted median of selected benchmarks) |
| REQ-BC-004 | P1 | Support band groupings — multiple CUPA codes can share a single salary band where appropriate |
| REQ-BC-005 | P1 | Faculty-specific band matrix: bands by rank × discipline, with benchmark group selection per cell |
| REQ-BC-006 | P1 | Band versioning — maintain historical band structures alongside current, with effective dates |
| REQ-BC-007 | P2 | Band override capability with audit-logged justification (e.g., "local market adjustment for nursing") |

**6.3.3 Employee-to-Band Placement**

| Requirement | Priority | Description |
|-------------|----------|-------------|
| REQ-BP-001 | P0 | Import employee compensation data (base salary, additional compensation, stipends) from Excel/CSV (automated via Oracle HCM in Phase 5) |
| REQ-BP-002 | P0 | Automatically place each employee in the appropriate salary band based on their CUPA code mapping |
| REQ-BP-003 | P0 | Calculate compa-ratio for each employee (actual salary ÷ band midpoint) |
| REQ-BP-004 | P0 | Flag employees below band minimum or above band maximum |
| REQ-BP-005 | P1 | Calculate position-in-range (penetration ratio): (actual − minimum) ÷ (maximum − minimum) |
| REQ-BP-006 | P1 | Support additional compensation components (stipends, overload pay, administrative supplements) with configurable inclusion/exclusion from band analysis |

### 6.4 Equity Analysis & Visualization

**6.4.1 Individual & Position-Level Analysis**

| Requirement | Priority | Description |
|-------------|----------|-------------|
| REQ-EA-001 | P0 | Position detail view showing: employee, band placement, compa-ratio, percentile within band, and benchmark comparison |
| REQ-EA-002 | P0 | Department/division summary views with aggregate statistics (mean compa-ratio, % in range, % below min, % above max) |
| REQ-EA-003 | P1 | Employee compensation history timeline (if historical data is loaded) |
| REQ-EA-004 | P2 | Peer comparison within same CUPA code across the institution |

**6.4.2 Institutional Equity Dashboard**

| Requirement | Priority | Description |
|-------------|----------|-------------|
| REQ-ED-001 | P0 | Summary dashboard: total positions, % with valid CUPA mapping, % within salary band, overall median compa-ratio |
| REQ-ED-002 | P0 | Distribution visualization: histogram/box plot of compa-ratios across the institution |
| REQ-ED-003 | P0 | Outlier identification: sortable list of employees furthest below band minimum and above band maximum |
| REQ-ED-004 | P1 | Compression analysis: identify pairs/groups where subordinates' pay approaches or exceeds supervisors' |
| REQ-ED-005 | P1 | Market alignment heatmap: by division/department, color-coded by how institutional medians compare to benchmark medians |
| REQ-ED-006 | P1 | Faculty-specific views: equity by rank, by discipline, by tenure status, with benchmark group overlays |
| REQ-ED-007 | P2 | Demographic equity overlays: analyze compa-ratio distributions by gender, race/ethnicity, years of service (requires demographic data import) |
| REQ-ED-008 | P2 | Scenario modeling: "What if we brought all employees to band minimum?" with total cost calculation |

**6.4.3 Reporting**

| Requirement | Priority | Description |
|-------------|----------|-------------|
| REQ-RP-001 | P0 | Export equity summary reports to PDF and Excel |
| REQ-RP-002 | P1 | VP-specific reports showing only their division's equity posture |
| REQ-RP-003 | P1 | Board-ready executive summary with configurable level of detail |
| REQ-RP-004 | P2 | Scheduled report generation and distribution |

---

## 7. Data Architecture

### 7.1 Core Entity Model

```
┌─────────────────────┐     ┌──────────────────────────┐
│   cupa_positions     │     │    benchmark_data        │
│─────────────────────│     │──────────────────────────│
│ cupa_code (PK)       │◄───┤ cupa_code (FK)           │
│ title                │     │ benchmark_group          │
│ description          │     │ survey_year              │
│ category             │     │ percentile_25            │
│ bls_soc_code         │     │ median                   │
│ bls_soc_name         │     │ percentile_75            │
│ population_type      │     │ mean                     │
│ catalog_year         │     │ n_reporting              │
└─────────┬───────────┘     └──────────────────────────┘
          │
          │ 1:many
          ▼
┌─────────────────────┐     ┌──────────────────────────┐
│ position_mappings    │     │    salary_bands          │
│─────────────────────│     │──────────────────────────│
│ mapping_id (PK)      │     │ band_id (PK)             │
│ employee_id          │────►│ cupa_code (FK)           │
│ cupa_code (FK)       │     │ band_group               │
│ institutional_title  │     │ minimum                  │
│ employee_name        │     │ midpoint                 │
│ division             │     │ maximum                  │
│ department           │     │ effective_date           │
│ supervisor           │     │ methodology_notes        │
│ vp_stem              │     │ band_width_pct           │
│ base_salary          │     └──────────────────────────┘
│ total_compensation   │
│ audit_status         │     ┌──────────────────────────┐
│ assigned_reviewer    │     │    audit_cycles          │
│ review_date          │     │──────────────────────────│
│ review_comments      │     │ cycle_id (PK)            │
└─────────────────────┘     │ name                     │
                             │ start_date               │
┌─────────────────────┐     │ end_date                 │
│      users           │     │ status                   │
│─────────────────────│     └──────────────────────────┘
│ user_id (PK)         │
│ email                │     ┌──────────────────────────┐
│ name                 │     │  faculty_positions       │
│ role                 │     │──────────────────────────│
│ division             │     │ position_id (PK)         │
│ saml_id              │     │ cupa_code (FK)           │
│ is_active            │     │ employee_name            │
└─────────────────────┘     │ rank                     │
                             │ discipline               │
                             │ cip_code                 │
                             │ tenure_status            │
                             │ years_in_rank            │
                             │ base_salary              │
                             │ department               │
                             │ school                   │
                             └──────────────────────────┘
```

### 7.2 Key Data Fields (Staff Position Mapping)

Derived from the current spreadsheet structure:

| Field | Source | Description |
|-------|--------|-------------|
| CUPA # | Master Sheet col A | Standardized CUPA-HR position number |
| CUPA Title | Master Sheet col B | Standardized position title (currently pulled via VLOOKUP) |
| CUPA Position Description | Master Sheet col C | Full text description of standardized role |
| BLS SOC # | Master Sheet col D | Bureau of Labor Statistics Standard Occupational Classification code |
| BLS SOC Category Name | Master Sheet col E | SOC category label |
| Moravian Job Title | VP tabs col D | Institutional job title |
| Last Name | VP tabs col E | Employee last name |
| First Name | VP tabs col F | Employee first name |
| Division | VP tabs col G | Organizational division (e.g., "Development," "Information Technology") |
| Department | VP tabs col H | Department within division (e.g., "09010 - Development Office") |
| Supervisor | VP tabs col I | Direct supervisor name |
| VP Stem | VP tabs col J | Senior leadership position to which the employee ultimately reports (references the role, not the individual) |
| Employee ID | VP tabs col K | Unique employee identifier |

### 7.3 Key Data Fields (Faculty)

Derived from the faculty CUPA multi-group comparison data:

| Field | Description |
|-------|-------------|
| Rank | Professor, Associate Professor, Assistant Professor, Instructor, Lecturer |
| Discipline | Academic discipline aligned with CIP codes |
| Tenure Status | Tenure-Track or Non-Tenure-Track |
| Benchmark Group Medians | Salary medians from Budget, Student FTE, Landmark, NACU, Faculty FTE, All Institutions comparison groups |
| Moravian Median | Institutional median salary for the rank/discipline intersection |
| Variance to Benchmark | Percentage difference between institutional and benchmark medians |

### 7.4 Database

SQLite via `better-sqlite3` for the initial deployment. The file-based database simplifies deployment (no separate database server), supports concurrent reads, and is more than sufficient for the data volumes involved (~500–1,000 positions, ~10–20 concurrent users). Data is persisted via Docker volumes.

Migration path to PostgreSQL is available if multi-instance or high-concurrency requirements emerge.

---

## 8. Technology Stack

### 8.1 Frontend

| Technology | Purpose |
|------------|---------|
| React 18 | Core UI framework — component-based SPA |
| TypeScript | Static typing across the entire frontend codebase |
| Vite | Development server and optimized production bundler |
| Tailwind CSS | Utility-first CSS framework |
| Radix UI | Accessible, unstyled component primitives (dialogs, dropdowns, tabs, tooltips, progress indicators) |
| React Router DOM | Client-side routing |
| Recharts | Data visualization for equity dashboards, salary band charts, compa-ratio distributions |
| Lucide React | Consistent icon library |
| class-variance-authority + clsx + tailwind-merge | Tailwind class composition utilities |

### 8.2 Backend

| Technology | Purpose |
|------------|---------|
| Node.js (≥18) | Server runtime |
| Express.js | REST API framework |
| TypeScript | Type-safe server code |
| better-sqlite3 | Synchronous, high-performance SQLite driver |
| JWT (jsonwebtoken) | Token-based session authentication |
| Passport.js + @node-saml/passport-saml | Authentication middleware with SAML 2.0 SSO support — configured for **Okta** as the institutional identity provider |
| bcryptjs | Password hashing for local accounts |
| Zod | Runtime schema validation for all API request payloads |
| multer | File upload handling (Excel imports) |
| xlsx (SheetJS) | Excel file parsing for data imports |
| tsx | TypeScript execution in development |

### 8.3 DevOps & Infrastructure

| Technology | Purpose |
|------------|---------|
| Docker | Containerized deployment for environment consistency |
| Docker Compose | Multi-service orchestration (frontend + backend + volumes) |
| PM2 | Production process manager with clustering, health monitoring, and auto-restart |
| npm workspaces | Monorepo structure with shared types and dependencies between client and server packages |

### 8.4 Architecture Summary

This is a **full-stack TypeScript monorepo** structured as:

```
cupa-equity-tool/
├── package.json              # Root workspace config
├── docker-compose.yml
├── packages/
│   ├── client/               # React SPA (Vite)
│   │   ├── src/
│   │   │   ├── components/   # UI components (Radix + Tailwind)
│   │   │   ├── pages/        # Route-level page components
│   │   │   ├── hooks/        # Custom React hooks
│   │   │   ├── services/     # API client functions
│   │   │   ├── types/        # Shared TypeScript interfaces
│   │   │   └── utils/        # Utility functions
│   │   └── vite.config.ts
│   ├── server/               # Express API
│   │   ├── src/
│   │   │   ├── routes/       # API route handlers
│   │   │   ├── middleware/   # Auth, validation, error handling
│   │   │   ├── services/     # Business logic layer
│   │   │   ├── db/           # SQLite schema, migrations, queries
│   │   │   ├── import/       # Excel/CSV import processors
│   │   │   └── types/        # Shared TypeScript interfaces
│   │   └── tsconfig.json
│   └── shared/               # Shared types and constants
│       └── src/
│           ├── types.ts      # Cross-package type definitions
│           └── constants.ts  # CUPA categories, status enums, etc.
└── Dockerfile
```

The React SPA is served via Vite in development and as static assets behind Express in production. The Express API handles authentication, data management, file imports, and equity calculations. SQLite persists as a file-based database via Docker volumes.

---

## 9. System Architecture

### 9.1 High-Level Architecture

```
┌─────────────────────────────────────────────────┐
│                   Browser (SPA)                  │
│  React 18 + TypeScript + Tailwind + Recharts     │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ Position  │ │  Audit   │ │  Equity          │ │
│  │ Mgmt UI  │ │ Workflow │ │  Dashboard       │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
└───────────────────────┬─────────────────────────┘
                        │ HTTPS / REST API
                        ▼
┌─────────────────────────────────────────────────┐
│              Express.js API Server               │
│  ┌────────────┐ ┌────────────┐ ┌──────────────┐ │
│  │ Auth       │ │ Position   │ │ Equity       │ │
│  │ Middleware │ │ Service    │ │ Calculation  │ │
│  │ (JWT+Okta)│ │            │ │ Engine       │ │
│  └────────────┘ └────────────┘ └──────────────┘ │
│  ┌────────────┐ ┌────────────┐ ┌──────────────┐ │
│  │ Import     │ │ Audit      │ │ Report       │ │
│  │ Processor  │ │ Workflow   │ │ Generator    │ │
│  │ (xlsx)     │ │ Service    │ │              │ │
│  └────────────┘ └────────────┘ └──────────────┘ │
└───────────────────────┬─────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────┐
│              SQLite (better-sqlite3)             │
│  Persisted via Docker Volume                     │
└─────────────────────────────────────────────────┘
```

### 9.2 API Design

RESTful API organized by domain:

| Route Group | Endpoints | Description |
|-------------|-----------|-------------|
| `/api/auth` | POST login, POST logout, GET session, POST saml/callback | Authentication |
| `/api/users` | CRUD + role assignment | User management |
| `/api/cupa-catalog` | GET, POST import, GET search | CUPA reference library |
| `/api/positions` | CRUD, POST import, GET by-division, GET by-reviewer | Institutional position mappings |
| `/api/audit-cycles` | CRUD, POST assign, PATCH status | Audit cycle management |
| `/api/reviews` | GET mine, PATCH confirm, PATCH flag, POST comment | VP review actions |
| `/api/benchmarks` | POST import, GET by-code, GET by-group | CUPA benchmark data |
| `/api/salary-bands` | CRUD, POST generate, GET by-code | Band construction |
| `/api/equity` | GET dashboard, GET compa-ratios, GET outliers, GET compression, POST scenario | Equity analysis |
| `/api/faculty` | CRUD, POST import, GET by-discipline, GET by-rank | Faculty-specific endpoints |
| `/api/reports` | POST generate, GET download | Report generation |

### 9.3 Authentication Flow

```
User ──► Login Page ──► Local Auth (email/password + bcrypt) [dev/fallback only]
                    └──► Okta SSO (SAML 2.0 via Passport.js)
                              │
                              ▼
                         JWT issued ──► stored in httpOnly cookie
                              │
                              ▼
                    All API requests include JWT
                    Middleware validates + extracts role + division scope
                    Route-level authorization by role
                    Data-level filtering by division assignment
```

---

## 10. User Workflows

### 10.1 Annual CUPA Audit Cycle (Primary Workflow)

```
Step 1: HR creates a new audit cycle ("2025-26 Annual Audit")
           │
Step 2: HR imports/updates institutional positions from Excel or HRIS export
           │      (manual Excel import initially; Oracle HCM integration in a later phase)
           │
Step 3: HR imports latest CUPA-HR catalog (if updated)
           │
Step 4: HR auto-assigns positions to VP reviewers based on VP-stem field
           │
Step 5: System sends notification to each VP with their assignment count + deadline
           │
Step 6: Each VP logs in, sees their review queue
           │
           ├── Confirms positions where CUPA mapping is accurate
           ├── Flags positions where mapping needs revision
           │       └── Provides reason + optional suggested CUPA code
           │
Step 7: HR reviews flagged positions
           │
           ├── Accepts VP suggestion → updates mapping
           ├── Resolves with different mapping → documents rationale
           ├── Requests additional information → comment thread with VP
           │
Step 8: HR marks audit cycle as complete
           │
Step 9: System generates audit completion report
```

### 10.2 Salary Band Construction Workflow

```
Step 1: HR imports CUPA-HR benchmark survey data for the current year
           │
Step 2: HR selects benchmark methodology
           │
           ├── Single group (e.g., use NACU medians as midpoints)
           ├── Weighted composite (e.g., 40% Budget + 30% NACU + 30% Landmark)
           │
Step 3: System auto-generates proposed band midpoints based on methodology
           │
Step 4: HR configures band width (e.g., ±20% of midpoint)
           │
Step 5: System generates complete band structure (min / midpoint / max)
           │
Step 6: HR reviews and adjusts individual bands as needed
           │
           ├── Market adjustments for hard-to-fill positions
           ├── Internal equity adjustments for related positions
           ├── All adjustments require documented justification
           │
Step 7: HR publishes the band structure (with effective date)
           │
Step 8: System places all employees in their bands and calculates compa-ratios
```

### 10.3 Equity Analysis Workflow

```
Step 1: HR navigates to Equity Dashboard
           │
Step 2: Reviews institutional summary
           │
           ├── Overall compa-ratio distribution
           ├── % of employees within band
           ├── Count below minimum / above maximum
           │
Step 3: Drills into specific areas of concern
           │
           ├── By division → department → individual
           ├── By CUPA category → specific code → employees
           ├── By faculty rank → discipline → individuals
           │
Step 4: Runs targeted analyses
           │
           ├── Compression detection (subordinate vs. supervisor pay)
           ├── Market alignment by department
           ├── Demographic overlays (if data available)
           │
Step 5: Models remediation scenarios
           │
           ├── "Bring all to band minimum" → total cost
           ├── "Target 1.0 compa-ratio for group X" → cost
           ├── Custom adjustments → cost modeling
           │
Step 6: Generates reports for leadership
```

---

## 11. UI/UX Requirements

### 11.1 Design Principles

- **Role-appropriate simplicity**: Senior leaders log in and see **only their division** — their positions, their audit tasks, their equity data. No awareness of or access to other divisions' data. HR sees the full institutional picture. Executives see read-only dashboards and summaries.
- **Data density where appropriate**: Equity dashboards should show rich, interactive visualizations. Audit review screens should be clean and action-oriented.
- **Accessibility**: WCAG 2.1 AA compliance. Radix UI primitives provide accessible foundations.
- **Responsive**: Functional on tablets for VP review scenarios, but primarily designed for desktop use.

### 11.2 Key Screens

**Global Navigation Sidebar:**
- Dashboard (role-dependent landing page)
- Positions (classification management)
- Audit (cycle management + review)
- Salary Bands (construction + management)
- Equity Analysis (dashboards + reports)
- Faculty (discipline/rank-specific views)
- Settings (admin only: users, system config)

**11.2.1 HR Dashboard**
- Audit cycle progress (donut chart: confirmed / flagged / pending by VP)
- Salary band health summary (% within range, median compa-ratio)
- Recent activity feed (latest reviews, imports, band changes)
- Action items (flagged positions awaiting resolution)

**11.2.2 Senior Leader Dashboard (Division-Scoped)**
- Same structural layout as the HR Dashboard but **filtered entirely to the logged-in leader's division(s)**
- Audit progress for their positions only
- Salary band health and compa-ratio summary for their division only
- No navigation or references to other divisions — the UI does not surface data the user cannot access
- Action items: positions awaiting their review

**11.2.3 VP Review Screen**
- Filtered table of assigned positions
- Status filter tabs (All / Pending / Confirmed / Flagged)
- Expandable row detail showing full CUPA description
- Confirm / Flag action buttons with inline comment
- Progress indicator ("You've reviewed 18 of 22 positions")

**11.2.4 Salary Band Visualization**
- Horizontal band chart: each row is a CUPA code or band group, showing min–midpoint–max range with employee dots plotted at their actual salary
- Color coding: green (within band), yellow (approaching boundary), red (outside band)
- Click-through to employee detail
- Faculty matrix view: rank × discipline grid with band health indicators

**11.2.5 Equity Dashboard**
- Compa-ratio distribution histogram (institution-wide)
- Box plots by division/department
- Market alignment heatmap
- Outlier table (sortable, filterable)
- Compression detection panel
- Scenario modeling interface

### 11.3 Data Import Interface

- Drag-and-drop Excel/CSV upload
- Column mapping preview with auto-detection
- Validation summary before commit (errors, warnings, rows to import)
- Import history log

---

## 12. Security & Access Control

### 12.1 Authentication

- **Primary: Okta SSO** — SAML 2.0 integration with Moravian's Okta tenant via Passport.js + @node-saml/passport-saml. Okta is the expected login path for all production users. User role and division assignment are managed within the application after initial Okta-authenticated login.
- **Fallback: Local accounts** — Email + bcrypt-hashed password for development, testing, and break-glass admin access only. Not intended for day-to-day use.
- **Session management**: JWT stored in httpOnly, secure, SameSite cookies. Configurable expiration (default: 8 hours). Token payload includes user ID, role, and division scope.

### 12.2 Division-Scoped Data Access

The core access model is: **HR sees everything; senior leaders see only their own divisions.** This scoping applies to all data surfaces — position lists, salary bands, equity dashboards, and reports.

| Role | Data Scope | What They See |
|------|-----------|---------------|
| HR Admin / HR Analyst | **Institution-wide** | All positions, all divisions, all salary bands, all equity data. Full import/export. Cross-divisional comparisons. |
| VP / Senior Leader Reviewer | **Own division(s) only** | Only positions where VP Stem matches their assignment. Salary band and equity views filtered to their divisions. Cannot see other divisions' compensation data. |
| Executive (CHRO, President) | **Institution-wide (read-only)** | Same visibility as HR but without edit/import capability. Dashboards and reports only. |
| Academic Dean / Dept Chair | **Own school/department only** | Faculty positions within their academic unit. Relevant salary bands and equity views. |

Division scoping is enforced at the **API layer**, not just the UI. Every data query is filtered by the authenticated user's division assignment(s) before results are returned. This ensures that even direct API access cannot retrieve out-of-scope data.

When a senior leader logs in, their landing page shows **only their world** — their positions, their audit tasks, their division's equity posture. No navigation to other divisions is available.

### 12.3 Role-Based Access Control (RBAC) — Detailed Permissions

| Role | Positions | Audit | Salary Bands | Equity | Users |
|------|-----------|-------|-------------|--------|-------|
| System Admin | Full CRUD (all divisions) | Full CRUD | Full CRUD | Full access (all divisions) | Full CRUD |
| HR Admin | Full CRUD (all divisions) | Full CRUD | Full CRUD | Full access (all divisions) | View only |
| HR Analyst | View + Import (all divisions) | View + Assign | View + Generate | Full access (all divisions) | None |
| VP Reviewer | View (**own division only**) | Review (**assigned only**) | View (**own division only**) | View (**own division only**) | None |
| Executive | View only (all divisions) | View progress | View only | View dashboards | None |
| Academic Dean | View (**own school only**) | Review (**assigned only**) | View (**own school only**) | View (**own school only**) | None |

### 12.4 Data Protection

- All data in transit encrypted via HTTPS/TLS
- SQLite database file encrypted at rest via Docker volume encryption
- Compensation data access logged for audit compliance
- PII fields (employee names, salaries) excluded from application logs
- Session tokens invalidated on logout and password change

---

## 13. Implementation Phases

### Phase 1: Foundation (Months 1–3)

**Goal:** Replace the spreadsheet with a functional digital workflow.

**Deliverables:**
- User authentication (Okta SSO + local fallback)
- Division-scoped data access — senior leaders see only their own divisions; HR sees everything
- CUPA catalog import and search
- Institutional position import from Excel (matching current spreadsheet structure)
- Position-to-CUPA mapping interface
- Basic audit cycle creation and VP assignment
- VP review interface (confirm/flag with comments)
- Audit progress dashboard
- Role-based access control

**Exit Criteria:** HR can create an audit cycle, assign positions to VPs, and VPs can complete their reviews entirely within the application.

### Phase 2: Salary Bands & Benchmarking (Months 3–5)

**Goal:** Build the core equity infrastructure.

**Deliverables:**
- CUPA benchmark data import
- Salary band construction interface (methodology selection, band width configuration)
- Auto-generated band proposals from benchmark data
- Employee compensation data import
- Employee-to-band placement with compa-ratio calculation
- Salary band visualization (horizontal band charts with employee dots)
- Outlier identification (below min / above max)
- Basic equity summary dashboard

**Exit Criteria:** HR can import benchmark data, construct salary bands, place employees, and view a complete equity snapshot.

### Phase 3: Advanced Equity & Faculty (Months 5–8)

**Goal:** Deep equity analysis and faculty population support.

**Deliverables:**
- Faculty position taxonomy (rank × discipline × tenure status)
- Faculty benchmark import (multi-group comparison structure)
- Faculty-specific salary band matrix
- Compression detection algorithm
- Market alignment heatmap by division/department
- Scenario modeling ("bring to minimum" cost calculator)
- Expanded reporting (PDF/Excel export)
- VP-specific equity reports (own division only)
- In-app + email notification system

**Exit Criteria:** Both staff and faculty populations are fully supported with salary bands and equity analysis. Leadership can view institution-wide equity dashboards.

### Phase 4: Refinement & Scale (Months 8–12)

**Goal:** Production hardening, advanced features, and institutional rollout.

**Deliverables:**
- Demographic equity overlays (gender, race/ethnicity analysis)
- Historical trend analysis (year-over-year band changes, compa-ratio movement)
- Scheduled/automated report generation
- AI-assisted CUPA mapping suggestions
- Performance optimization for large datasets
- Comprehensive audit logging
- Documentation and training materials
- Configurable escalation workflows

**Exit Criteria:** Full production deployment with all user populations onboarded and trained.

### Phase 5: Oracle HCM Integration (Post-Launch)

**Goal:** Replace manual Excel imports with automated data sync from Oracle HCM.

**Deliverables:**
- Oracle HCM API integration for employee position data (titles, departments, reporting hierarchy, employee IDs)
- Oracle HCM API integration for compensation data (base salary, additional compensation, stipends)
- Oracle HCM API integration for organizational hierarchy (divisions, departments, supervisor relationships)
- Automated sync scheduling (configurable frequency — daily, weekly, or on-demand)
- Delta sync — detect and surface changes since last sync (new hires, terminations, title changes, salary changes, reorgs)
- Conflict resolution UI — when Oracle HCM data conflicts with existing CUPA mappings, surface for HR review rather than silently overwriting
- Optional: demographic data pull for equity overlays (gender, race/ethnicity, tenure) — subject to data governance approval

**Prerequisites:**
- Oracle HCM API access provisioned by IT
- Data mapping between Oracle HCM fields and CUPA tool fields documented and validated
- Core tool stable and in production use (Phases 1–4 complete)

**Exit Criteria:** Employee and compensation data flows automatically from Oracle HCM. Manual Excel import is retained as a fallback but is no longer the primary data source.

---

## 14. Success Metrics & KPIs

### Operational Metrics

| Metric | Measurement | Target |
|--------|-------------|--------|
| Audit cycle completion time | Days from cycle creation to close | ≤21 days (down from ~56) |
| VP review turnaround | Median days from assignment to completion | ≤7 days |
| Position classification accuracy | % of positions confirmed without flags | ≥85% |
| Salary band coverage | % of positions with published salary bands | 100% |

### Equity Metrics

| Metric | Measurement | Target |
|--------|-------------|--------|
| Band compliance rate | % of employees within their salary band | ≥90% |
| Median institutional compa-ratio | Overall median across all positions | 0.95–1.05 |
| Below-minimum count | Employees below band minimum | Decreasing quarter-over-quarter |
| Compression incidents | Supervisor-subordinate pairs with <5% pay differential | Identified and documented |

### System Metrics

| Metric | Measurement | Target |
|--------|-------------|--------|
| User adoption | Monthly active users / total provisioned users | ≥90% within 6 months |
| Data freshness | Days since last benchmark data import | ≤30 days during survey season |
| System uptime | Availability during business hours | ≥99.5% |

---

## 15. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| VP adoption resistance — users may prefer Excel | Medium | High | Intuitive VP review UI; training sessions; executive mandate; demonstrate time savings |
| CUPA-HR data format changes between survey years | Medium | Medium | Flexible import mapper with column-mapping preview; version the import templates |
| Salary data sensitivity — breach or unauthorized access | Low | Critical | RBAC enforcement; encrypted transport and storage; access audit logging; minimal PII in logs |
| SQLite concurrency limitations under heavy concurrent writes | Low | Medium | SQLite WAL mode; write operations serialized through service layer; PostgreSQL migration path documented |
| Scope creep into full HRIS functionality | High | Medium | Strict scope boundary: this tool handles classification, bands, and equity analysis only — not hiring, benefits, or performance management. Oracle HCM integration is planned but explicitly deferred to Phase 5 |
| Faculty governance concerns about transparency | Medium | Medium | Read-only equity views for deans/chairs; clear data provenance; configurable visibility by role |
| Benchmark data availability gaps (some CUPA codes lack data) | Medium | Low | Band grouping feature allows multiple codes to share a band; manual override with documentation |
| Oracle HCM API access delays or field mapping complexity (Phase 5) | Medium | Medium | Design the data model to be import-source-agnostic from Day 1; retain Excel import as a permanent fallback; engage IT early to provision API access |

---

## 16. Future Considerations

These capabilities are explicitly **out of scope** for Phases 1–4 but represent natural extensions:

*Note: Oracle HCM integration is a **committed Phase 5 deliverable**, not a speculative future item. See Section 13 for details.*

1. **Predictive analytics** — AI-driven projections of compensation trends, turnover risk based on band position, and equity drift modeling
2. **Total rewards perspective** — Expand beyond base salary to include benefits valuation, retirement contributions, and non-cash compensation
3. **Multi-institution consortium** — Anonymized, opt-in data sharing across peer institutions for real-time benchmarking
4. **Additional HRIS connectors** — If the tool expands beyond Moravian, support API connectors for other common higher ed HRIS platforms (Workday, Banner, Colleague) in addition to Oracle HCM
5. **Labor market integration** — Real-time BLS and job posting data to supplement CUPA survey benchmarks
6. **DEI analytics enhancement** — Intersectional analysis across multiple demographic dimensions with statistical significance testing
7. **Position description management** — Extend from classification to full position description authoring and maintenance
8. **Compensation planning** — Merit increase modeling and budget allocation tools linked to band position and equity priorities

---

## 17. Appendices

### Appendix A: CUPA-HR Classification Structure

The CUPA-HR system maintains separate taxonomies for administrative/professional and faculty positions. The administrative taxonomy uses numeric position codes organized into hierarchical categories (executives → senior officers → deans → administrators → department heads → associate/assistant deans). The faculty taxonomy is organized by rank, tenure status, and CIP-code-based discipline. Both taxonomies are updated annually as part of the CUPA-HR salary survey cycle.

### Appendix B: Glossary of Terms

| Term | Definition |
|------|-----------|
| **CUPA-HR** | College and University Professional Association for Human Resources — the organization that administers annual compensation surveys for higher education |
| **CUPA Code** | Standardized position number assigned by CUPA-HR to each benchmark position |
| **BLS SOC Code** | Bureau of Labor Statistics Standard Occupational Classification code — a federal system for classifying workers into occupational categories |
| **Compa-Ratio** | An employee's actual salary divided by their salary band midpoint (1.0 = at midpoint) |
| **Position-in-Range** | (Actual salary − band minimum) ÷ (band maximum − band minimum) — measures penetration through the band (0% = at minimum, 100% = at maximum) |
| **Salary Band** | A defined pay range (minimum, midpoint, maximum) for a position or group of positions |
| **Band Width** | The percentage spread from minimum to maximum of a salary band |
| **Compression** | When there is insufficient pay differential between positions of meaningfully different responsibility levels (e.g., supervisor vs. subordinate) |
| **VP Stem** | The senior leadership position to which an employee's chain of command ultimately reports. References the role (e.g., "Provost," "EVP for University Life"), not the individual currently in the seat |
| **CIP Code** | Classification of Instructional Programs — the standard taxonomy for academic disciplines used in faculty compensation benchmarking |
| **Benchmark Group** | A defined set of peer institutions against which salary data is compared (e.g., Budget peers, NACU members) |

### Appendix C: Institutional Organizational Structure (Senior Leadership Positions)

The initial deployment will reflect the following senior leadership positions and their divisional ownership, as derived from the 2023–24 CUPA Audit workbook:

| Position | Division(s) |
|----------|-------------|
| President and CEO | Cross-divisional / President's Cabinet |
| Provost, VP for Academic Affairs, CAO | Academic Programs, Registrar, Library, Academic Departments |
| Executive VP for University Life, COO | Student Life, Athletics, HR, Campus Police, Counseling, Support Services |
| VP for Finance & Administration, CFO | Finance, Business Office, Student Accounts, Facilities |
| VP for Enrollment and Marketing | Admissions, Marketing & Communications, Financial Aid |
| VP for Development and Alumni Engagement | Development |
| VP and Chief Information Officer | Information Technology |
| Seminary Dean | Seminary / LTS |
| Chief Innovation Officer / MD of SPSI | Professional Studies, Institutional Research, Partnerships |
| VP & Dean for Equity and Inclusion, CDO | DEI, Intercultural Advancement |

This structure is fully configurable. When leadership positions turn over or divisions are reorganized, the system is updated to reflect the new structure — all historical audit data retains its original assignment for audit trail purposes.

### Appendix D: Statistical Methodology

Equity analysis will employ the following statistical approaches:

- **Descriptive statistics**: Mean, median, standard deviation, and percentile distributions of compa-ratios by organizational unit
- **Outlier detection**: Positions falling more than 1.5× IQR below Q1 or above Q3 of their band's compa-ratio distribution
- **Compression analysis**: Pairwise comparison of supervisor-subordinate compensation with configurable minimum differential thresholds
- **Demographic equity** (Phase 4): Regression-based analysis controlling for legitimate pay factors (experience, rank, credentials) to isolate unexplained variance correlated with protected characteristics

---

## Approval

| Name | Role | Signature | Date |
|------|------|-----------|------|
| | | | |
| | | | |
| | | | |

---

*Document generated February 4, 2026. This PRD is a living document and will be updated as requirements evolve through stakeholder feedback and implementation learnings.*
