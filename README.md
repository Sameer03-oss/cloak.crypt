# Cloak.Crypt - Vaultline Secure Data Platform

A secure data platform with encrypted vault storage, built with React (Vite), Express.js, Clerk authentication, and MongoDB.

## Project Structure

```
├── api/[...path].ts          # Vercel serverless function entry point
├── artifacts/
│   ├── api-server/           # Express.js backend API
│   ├── vaultline/            # React frontend (Vite)
│   └── mockup-sandbox/       # Component mockup sandbox
├── lib/
│   ├── api-client-react/     # Generated API client
│   ├── api-zod/              # Zod schemas from OpenAPI
│   ├── api-spec/             # OpenAPI spec & codegen
│   └── db/                   # Drizzle ORM schema
├── vercel.json               # Vercel deployment config
└── pnpm-workspace.yaml       # pnpm workspace config
```

## Prerequisites

- Node.js 20+
- pnpm 9+
- MongoDB database
- Clerk account for authentication

## Environment Variables

Create `.env` file in the root directory:

```env
# Database
MONGODB_URI=mongodb://localhost:27017/vaultline
DB_NAME=vaultline

# Clerk Authentication
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# API Server
PORT=8080
API_PORT=8080

# Frontend
BASE_PATH=/
```

## Local Development

### 1. Install Dependencies

```bash
pnpm install --frozen-lockfile
```

### 2. Start Development Servers

**Terminal 1 - API Server:**
```bash
cd artifacts/api-server
pnpm run dev
```

**Terminal 2 - Frontend:**
```bash
cd artifacts/vaultline
pnpm run dev
```

The frontend will be available at `http://localhost:5173` and proxies API calls to `http://localhost:8080`.

### 3. Run TypeScript Type Checking

```bash
pnpm run typecheck
```

## Production Build

### Build All Packages

```bash
# Build frontend
cd artifacts/vaultline
pnpm run build

# Build API server
cd ../api-server
pnpm run build
```

### Build Outputs

- **Frontend:** `artifacts/vaultline/dist/public/` - Static assets for Vercel
- **API Server:** `artifacts/api-server/dist/` - Bundled ESM modules (`.mjs`)

## Vercel Deployment

### Automatic Deployment

1. Push to GitHub
2. Connect repository to Vercel
3. Configure environment variables in Vercel dashboard:
   - `MONGODB_URI`
   - `DB_NAME`
   - `CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
4. Deploy

### Manual Deployment

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel --prod
```

### Vercel Configuration (`vercel.json`)

```json
{
  "buildCommand": "pnpm --filter @workspace/vaultline run build && pnpm --filter @workspace/api-server run build",
  "outputDirectory": "artifacts/vaultline/dist/public",
  "installCommand": "pnpm install --frozen-lockfile",
  "framework": "vite",
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/$1" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

The configuration:
- Builds both frontend and API server
- Serves static frontend from `artifacts/vaultline/dist/public`
- Routes `/api/*` to the serverless function at `api/[...path].ts`
- Falls back to `index.html` for SPA routing

## API Routes

- `GET /api/healthz` - Health check
- `GET /api/vault/items` - List vault items (auth required)
- `GET /api/vault/items/:id` - Get vault item (auth required)
- `POST /api/vault/items` - Create vault item (auth required)
- `DELETE /api/vault/items/:id` - Delete vault item (auth required)
- `/api/__clerk/*` - Clerk authentication proxy

## Tech Stack

- **Frontend:** React 19, Vite 7, Tailwind CSS 4, Wouter (routing), TanStack Query
- **Backend:** Express 5, TypeScript, esbuild
- **Auth:** Clerk
- **Database:** MongoDB (native driver)
- **Validation:** Zod
- **Logging:** Pino
- **Build:** pnpm workspaces, TypeScript project references

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm install --frozen-lockfile` | Install all dependencies |
| `pnpm run build` | Build all packages |
| `pnpm run typecheck` | Run TypeScript checks |
| `pnpm --filter @workspace/vaultline run dev` | Start frontend dev server |
| `pnpm --filter @workspace/api-server run dev` | Start API server dev mode |
| `pnpm --filter @workspace/vaultline run build` | Build frontend for production |
| `pnpm --filter @workspace/api-server run build` | Build API server for production |

## Troubleshooting

### Port Conflicts
- Frontend default: 5173
- API server default: 8080
- Set `PORT` and `API_PORT` env vars to change

### MongoDB Connection
Ensure `MONGODB_URI` is set and the database is accessible.

### Clerk Auth Issues
Verify `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` are correct and match your Clerk application.

### Build Failures
Run `pnpm run typecheck` to see TypeScript errors before building.