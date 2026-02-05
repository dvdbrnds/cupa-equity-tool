# CUPA Position & Equity Analysis Tool

A full-stack web application for managing CUPA-HR position classifications, audit workflows, and compensation equity analysis.

## Features

- **Position Classification Engine**: Import and manage CUPA-HR position catalogs
- **Audit Workflow Manager**: Assign positions to VP reviewers, track confirmations and flags
- **Division-Scoped Access**: VPs see only their divisions; HR sees institution-wide data
- **Role-Based Access Control**: System admin, HR admin, HR analyst, VP reviewer, executive roles

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Radix UI, Recharts
- **Backend**: Node.js, Express.js, TypeScript, better-sqlite3
- **Authentication**: JWT with httpOnly cookies (Okta SSO planned for Phase 2)

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### Installation

```bash
# Install dependencies
npm install

# Build shared types
npm run build:shared

# Seed the database with initial users
npm run db:seed -w @cupa/server

# Start development servers
npm run dev
```

The application will be available at:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

### Default Users

After seeding, the following test accounts are available:

| Email | Password | Role |
|-------|----------|------|
| admin@moravian.edu | admin123 | System Administrator |
| hr@moravian.edu | hr123 | HR Administrator |
| provost@moravian.edu | vp123 | VP Reviewer (Provost) |
| evp@moravian.edu | vp123 | VP Reviewer (EVP) |
| cfo@moravian.edu | vp123 | VP Reviewer (CFO) |
| cio@moravian.edu | vp123 | VP Reviewer (CIO) |

## Data Import

1. Log in as an HR Administrator
2. Navigate to **Import Data**
3. Upload the CUPA catalog Excel file first (master sheet with CUPA codes)
4. Then upload the institutional positions workbook (VP tabs with employee data)

## Project Structure

```
cupa-equity-tool/
├── packages/
│   ├── client/         # React SPA
│   ├── server/         # Express API
│   └── shared/         # Shared TypeScript types
├── data/               # SQLite database (gitignored)
├── Dockerfile
└── docker-compose.yml
```

## Docker Deployment

```bash
# Build and run
docker-compose up -d

# View logs
docker-compose logs -f
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3001 | Server port |
| NODE_ENV | development | Environment mode |
| DATA_DIR | ./data | SQLite database directory |
| JWT_SECRET | dev-secret | JWT signing secret (change in production!) |
| CLIENT_URL | http://localhost:5173 | Frontend URL for CORS |

## License

Proprietary - Moravian University
