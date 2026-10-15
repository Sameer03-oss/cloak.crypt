# Vaultline Secure Data Platform

Vaultline encrypts text and images in the browser and stores encrypted vault history behind Clerk authentication.

## Run & Operate

- `pnpm install --frozen-lockfile` — install workspace dependencies
- Start the `artifacts/vaultline: web` workflow for the frontend preview
- Start the `artifacts/api-server: API Server` workflow for vault history and authentication
- `pnpm --filter @workspace/api-server run dev` — run the API server (local `API_PORT`, defaults to 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Local environment values are listed in `.env.example`; `.env` is ignored by Git.
- Required app values: `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_PUBLISHABLE_KEY`,
  `CLERK_SECRET_KEY`, and `MONGODB_URI`; `DB_NAME` defaults to `AARYAN`.
- For Replit, add credentials with the Secrets tool. For Vercel, add the same
  values under Project Settings → Environment Variables.

## Vercel

- Import the repository with the repository root as the Vercel Root Directory.
- `vercel.json` builds the Vaultline static frontend and routes API requests to
  the Express function in `api/[...path].ts`; other paths use the SPA entry.
- Configure `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_PUBLISHABLE_KEY`,
  `CLERK_SECRET_KEY`, and `MONGODB_URI` in Vercel. Set both publishable-key
  variables to the same Clerk publishable key.
- Vercel Functions cap request and response bodies at 4.5 MB. Large encrypted
  image saves can exceed this limit; use smaller images until storage is moved
  outside the function request.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 with Clerk authentication
- Vault history: MongoDB (only encrypted payloads are stored)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
