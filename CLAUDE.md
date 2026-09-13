# CLAUDE.md

> Read this file in full before making any changes. If something here conflicts with what you observe in the code, flag the discrepancy instead of silently picking one.

## 1. Project Overview

**What this project is:** A food journal and social network built around rating individual _dishes_ (not just restaurants) — users log dishes they've eaten, rate/review them, and follow others to discover well-rated dishes near them.

**Current stage:** Backend MVP in progress — **backend only for now**; web/mobile frontends are deferred and the user will decide their design. **Mobile is the main product, but the web app comes first as the surface for demos and design iteration** — so the API must serve browser clients well from the start, not only mobile. Done: monorepo scaffold + CI, Prisma schema and initial migration, shared tier/ranking logic, FHRS London restaurant import (~51k restaurants), TasteAtlas dish catalogue import (9,980 dishes, 42 cuisines). Next: tRPC API in `/apps/api`, starting with restaurant and dish search.

**Core architecture (one paragraph):**
A TypeScript monorepo sharing types and business logic between a Next.js web app and a React Native (Expo) mobile app, both talking to a single Node/TypeScript API backed by Postgres. The dish is the primary entity — restaurants, users, and ratings all attach to it — which is the main structural thing that differs from typical restaurant-review apps.

## 2. Tech Stack & Why

| Layer                       | Choice                                                     | Notes                                                                                                                                                                                                                                                             |
| --------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language                    | TypeScript everywhere                                      | One language across web, mobile, and backend — enables shared types and logic                                                                                                                                                                                     |
| Web                         | Next.js                                                    | SSR for public dish/restaurant pages (SEO matters for discovery), React for the app shell                                                                                                                                                                         |
| Mobile                      | React Native + Expo                                        | Shares component logic and business logic with web more easily than native iOS/Android                                                                                                                                                                            |
| Backend                     | Node.js, tRPC (or REST if tRPC proves awkward with mobile) | End-to-end type safety with web; evaluate early whether tRPC's DX holds up for mobile clients                                                                                                                                                                     |
| Database                    | Postgres + Prisma ORM                                      | Relational integrity between users, restaurants, dishes, ratings; add a vector DB later only if/when recommendation search needs it                                                                                                                               |
| Auth                        | **Supabase Auth**                             | Apple / Google / email magic link. The API verifies Supabase JWTs (`jose`) and `User.id` is the Supabase `auth.uid` — no email stored in our DB. Not built yet.                                                                                                                    |
| Image/file storage          | **Supabase Storage**                                       | Used for dish photos and any user-uploaded images. Upload flow: clients upload direct-to-bucket using signed upload URLs issued by the API, so photos never hit Vercel serverless body limits.                                                                                                 |
| State management            | **TanStack Query (React Query)**                           | Pairs naturally with tRPC for server state on both web and mobile; use plain React state/context for local UI state. Add a dedicated client-state library (e.g. Zustand) only if cross-component client state actually gets unwieldy — don't add it preemptively. |
| Styling / cross-platform UI | **Tamagui**                                                | Purpose-built for sharing a single styling API between Next.js and React Native/Expo, which is a better fit here than `react-native-web` + separate CSS given the shared `/packages/ui` goal.                                                                     |
| Hosting                     | **Vercel** (web + api), **EAS** (mobile)                   | See note in Directory Structure below — since only Vercel was chosen (no separate backend host), the api is colocated with the web app rather than deployed as a standalone service.                                                                              |
| Monorepo tooling            | Turborepo                                                  | Manages shared packages (types, UI primitives, API client) across web/mobile/backend                                                                                                                                                                              |
| Testing                     | Vitest (unit), Playwright (web e2e)                        | TBD: mobile e2e approach (Detox vs manual for now)                                                                                                                                                                                                                |

### Data sources

- **Restaurants:** UK FSA Food Hygiene Rating Scheme (FHRS) open data — free under the Open Government Licence, London's 33 local authorities only. Gives name, address, postcode, coordinates, business type, hygiene rating. **No cuisine, photos, or opening hours.** Imported weekly by `/scripts/import-fhrs` (GitHub Actions).
- **Canonical dish list + cuisines:** from **TasteAtlas** data the user scraped in an earlier project (apalate) — `/Users/eric/Projects/apalate/data/processed/dishes_enriched.csv` (10,395 rows) plus `raw/tasteatlas/cache_mentions.json` (London review mention counts). Cuisines come from the user's own hand-maintained country → cuisine table (apalate `src/apalate/cuisines.py`), not from TasteAtlas. Imported by `/scripts/import-dishes`, which produces 9,980 dishes and 42 cuisines. Import rules (decided with the user):
  - **Fields kept:** name, other names, category, cuisine, ingredients. **Never import TasteAtlas descriptions, scores or ratings** — that's TasteAtlas's own content.
  - **Scope:** every dish, with `popularity` (London review mentions) used to rank search results.
  - **Same-name country versions merge into one dish** (8 × Hummus → `hummus`) and the merged dish gets **every cuisine its versions had** (Hummus → Middle Eastern, North African, Turkish). Category and ingredients come from the unsuffixed entry, or else the most-mentioned version.
  - **Variants link to their root parent** via `parentId` (Pizza Margherita → Pizza).

Don't introduce a new library, framework, or pattern to solve a problem an existing dependency already solves. If a new dependency seems genuinely needed, propose it and explain why before adding it.

## 3. Monorepo / Directory Structure

```
/apps
  /web          — Next.js app (public pages, web app shell)             [not started — frontend deferred]
  /mobile       — Expo/React Native app                                  [not started — frontend deferred]
  /api          — Node/TypeScript backend (tRPC routers, business logic) [not started — next]
/packages
  /db           — Prisma schema, migrations, client (@tastecult/db) and test helpers (@tastecult/db/testing)
  /shared-types — Tier scale, alias normalization, latest-log aggregation, Bayesian ranking, zod input schemas
  /ui           — Cross-platform UI primitives, built with Tamagui       [not started — frontend deferred]
  /api-client   — Typed client wrapping tRPC calls, used by both web and mobile [not started]
/scripts
  /import-fhrs  — FHRS London restaurant import (CLI; scheduled weekly in GitHub Actions)
  /import-dishes — TasteAtlas dish + cuisine catalogue import (CLI; run manually)
/docker         — Local Postgres init SQL (creates the test database)
```

Workspace packages are consumed as TypeScript source (`exports` point at `src/*.ts`) — there's no per-package build step. Tests live next to the code as `*.test.ts`; there's no top-level `/tests` directory. Pure business logic currently lives in `/packages/shared-types`; split out a separate package only if it outgrows that.

New code goes in the matching existing package. Business logic that both web and mobile need (rating calculation, feed ranking, validation) belongs in `/packages`, not duplicated inside `/apps/web` or `/apps/mobile`.

**Hosting note:** `/apps/web` and `/apps/api` both deploy to **Vercel** (as separate Vercel projects within the same monorepo, since no other backend host was chosen) — keep the tRPC/api layer structured so it can run as Vercel serverless functions rather than a long-running server process. `/apps/mobile` builds and ships via **EAS**. If `/apps/api` ever needs a long-running process (websockets, background jobs), that's a signal to revisit this and introduce a dedicated backend host — don't force it onto Vercel serverless past that point. Batch jobs (e.g. the FHRS import) run as scheduled GitHub Actions workflows for this reason.

## 4. Domain Model (core entities — keep this current as schema evolves)

Source of truth for fields and constraints: [`packages/db/prisma/schema.prisma`](packages/db/prisma/schema.prisma). Dish identity is solved with a **curated canonical dish list** rather than per-restaurant free text — that's what lets the same dish be compared across restaurants.

- **User** — `id` is the Supabase auth uid (no email stored here); unique `username`; `role` USER/ADMIN (set manually in the DB)
- **Restaurant** — imported from FHRS and keyed by `fhrsId`; never user-created. Soft-closed via `closedAt` when it drops out of the feed, never deleted (logs reference it). `latitude`/`longitude` are null for ~20% of London rows because FHRS has no geocode for them — those restaurants appear in name search but not "nearby"
- **Cuisine** — fixed list (42) with `region` and `macroRegion` roll-ups (Thai → Southeast Asian → Asian) so filters work at any level. Linked to dishes many-to-many through **DishCuisine**, and all of a dish's cuisines are equal — there's no primary cuisine
- **Dish** — canonical dish from the curated list, shared across restaurants. `status` is APPROVED / PENDING / REJECTED: a user can request a missing dish and log against it straight away; it's visible only to the requester until an admin approves it, merges it into another dish (`mergedIntoId`), or rejects it. Catalogue dishes also carry `category`, `otherNames` and `ingredients` (for search and filters), `popularity` (London mentions, for ranking) and `parentId`, which links a variant to its root parent — not the same thing as `mergedIntoId`
- **MenuItem** — a dish as one restaurant serves it: (restaurant, dish, alias). `alias` is the restaurant's own menu name ("Spicy miso ramen" → Ramen); `normalizedAlias` (`''` when there's no alias) makes the unique key work. **Ratings group per menu item**, so two differently named ramens at one restaurant are rated separately but both roll up to Ramen across restaurants
- **Rating** — one logged visit: a required menu item (so restaurant and dish are required), `tier`, `visitedAt` (calendar date); optional `cuisineId`, `photoPath` and `note`. The logged cuisine is the logger's call for that visit and any cuisine is valid; the UI suggests the dish's cuisines, with an "Other" option that unlocks the rest. Every visit is a new row. **Stats use only each user's latest log per menu item** (`latestLogPerUser` in shared-types) so repeat visits don't stack votes
- **Follow / Block** — follow graph and blocks; blocked users are hidden from feeds, stats and search
- **Report / MissingPlaceReport** — moderation queue and "can't find this restaurant" reports

**What a log captures:** restaurant (required), dish (required), dish alias (optional), cuisine (optional — the dish's cuisines are offered, "Other" unlocks all 42), tier (required), date (required, defaults to today), photo (optional), note (optional).

**Rating scale:** 5 tiers stored as Int 1–5 — Skip · Fine · Good · Must-order · Life-changing. Labels live only in `packages/shared-types/src/tiers.ts`; a DB CHECK constraint enforces the range.

Don't add fuzzy or string matching between dishes — identity comes from the canonical list plus admin merges. If that seems insufficient for a feature, raise it for discussion first.

Open questions (flag before building on top of them):

- Whether dish stats and discovery roll variant ratings up into their parent (does "best pizza" include Pizza Margherita logs?) — decide when building `dish.byId` and discovery
- Using a restaurant's cuisine to spot and override wrong dish–cuisine labels (the user's plan for later). Restaurants have no cuisine yet — FHRS doesn't provide one, so the cuisines people log are the likely source

## 5. Conventions

- **Naming:** camelCase for variables/functions, PascalCase for components/types, kebab-case for file names
- **Error handling:** typed errors (tRPC error codes or a shared `AppError` type), never swallow errors silently, no empty `catch` blocks
- **Style/formatting:** enforced by `eslint` + `prettier` — run before committing, don't hand-format
- **One way to do things:** if a pattern exists for a task (data fetching, form handling, styling), reuse it across web and mobile where possible. Don't introduce a second competing pattern.
- **Shared vs platform-specific:** default to putting logic in `/packages` unless it's genuinely platform-specific (native camera access, web SEO metadata, etc.)
- **Comments:** explain _why_, not _what_.

## 6. Commands

```bash
# One-time setup (Node >= 24; corepack provides pnpm 10)
corepack enable
pnpm install
cp .env.example .env                       # local Postgres defaults work as-is
pnpm db:up                                 # Postgres 17 in Docker on localhost:54329 (dev + test DBs)
pnpm --filter @tastecult/db db:deploy      # apply migrations to the dev DB
DATABASE_URL=postgresql://tastecult:tastecult@localhost:54329/tastecult_test \
  pnpm --filter @tastecult/db db:deploy    # ...and to the test DB

# Database
pnpm --filter @tastecult/db db:generate               # regenerate the Prisma client after schema changes
pnpm --filter @tastecult/db db:migrate --name <name>  # create + apply a migration on the dev DB
pnpm --filter @tastecult/db db:studio

# Restaurant import (FHRS, London)
pnpm --filter @tastecult/import-fhrs start                     # all 33 authorities (~15s)
pnpm --filter @tastecult/import-fhrs start --authority Camden  # one authority (name or FHRS id)
pnpm --filter @tastecult/import-fhrs start --dry-run           # fetch + transform only, no writes

# Dish + cuisine catalogue (TasteAtlas data from the apalate project; add --dry-run to preview)
pnpm --filter @tastecult/import-dishes start \
  --dishes /Users/eric/Projects/apalate/data/processed/dishes_enriched.csv \
  --mentions /Users/eric/Projects/apalate/data/raw/tasteatlas/cache_mentions.json

# Checks (all run in CI)
pnpm format:check      # pnpm format to fix
pnpm lint
pnpm typecheck
pnpm test              # packages run one at a time; DB integration tests need Postgres (pnpm db:up)

# Not built yet: backend dev server (/apps/api), web, mobile
```

Always run tests and lint/typecheck before considering a task done. If a command fails, fix it or report the failure — don't work around it or skip it silently.

## 7. Testing Philosophy

- Every new endpoint/mutation gets at least one test covering the happy path and one edge case.
- Shared packages (`/packages`) need higher test coverage than `/apps` UI code — bugs there affect both platforms.
- Don't mock what you don't have to — prefer a real test DB (or in-memory Postgres) over heavy mocking of Prisma.

## 8. Continuous Integration (CI)

CI runs automatically on every push/PR via GitHub Actions (`.github/workflows/ci.yml`). It:

1. Installs dependencies (pnpm, Node 24) with a Postgres 17 service container
2. Generates the Prisma client and applies migrations to the CI database
3. Runs format check, lint and typecheck across the monorepo
4. Runs the test suite (unit tests plus DB integration tests)
5. Builds (a no-op until `/apps/api` and `/apps/web` exist)

A second workflow, `.github/workflows/import-fhrs.yml`, runs the FHRS import weekly (Mondays 04:00 UTC) or on manual dispatch with an optional single authority. It needs the `DATABASE_URL` repository secret, which isn't set yet. The repository is `github.com/ericlclee/tastecult` (default branch `main`).

**A red CI run is a blocker, not a suggestion.** Do not merge, and do not consider a task done, if CI is failing — including failures in code you didn't directly touch this session, since that usually means an interaction you introduced. If CI fails and the cause isn't obvious, say so rather than force-pushing around it.

CI does not yet cover: mobile build/e2e (Expo builds are slower and typically run less frequently — TBD whether via EAS Build in CI or manual for now), and deployment (handled separately once a hosting target is chosen).

## 9. Task Workflow

For any non-trivial task:

1. State a short plan before writing code (what files/packages you'll touch, what approach you'll take).
2. Make the smallest change that satisfies the task — don't refactor unrelated code opportunistically.
3. If a change affects a shared package, confirm it doesn't silently break the other platform (web vs mobile).
4. Run tests/lint locally after the change, not just at the end of a session — don't rely on CI to catch what you could catch immediately.
5. If a task reveals a structural problem (duplicated logic between web/mobile, missing shared type), note it rather than silently fixing it mid-task, unless trivial and in scope.

## 10. Things Not to Touch / Known Gotchas

- **Local Postgres runs on port 54329**, not 5432 (5432 was already taken on the dev machine). CI uses 5432.
- **Prisma 7 doesn't auto-load `.env`.** `packages/db/prisma.config.ts` and the import CLI load the root `.env` explicitly. The generated client lives in `packages/db/src/generated/` (gitignored — run `db:generate`).
- **Hand-edited migration SQL:** the `pg_trgm` extension and the `Rating_tier_check` CHECK constraint are in the init migration SQL because `schema.prisma` can't express them. Keep them intact if a future migration recreates those objects.
- **`prisma migrate dev` refuses data-loss changes in non-interactive shells** (e.g. dropping a populated column). Workaround: `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`, save the output as `prisma/migrations/<timestamp>_<name>/migration.sql`, add any data backfill before the destructive statements (see `20260913230000_dish_cuisines`), then apply with `db:deploy`.
- **Integration tests wipe the database.** `resetDatabase()` truncates every table; `createTestPrismaClient()` refuses any URL whose database name doesn't contain "test". Test files within a package run serially (`fileParallelism: false`), and `pnpm test` runs packages one at a time (`--concurrency=1`) because all packages share the one test database — running them in parallel makes tests flaky.
- **Both imports upsert with raw SQL** (`jsonb_to_recordset`), so imported restaurants and dishes get UUID ids rather than cuids, and any new `Restaurant` or `Dish` column must also be added to the SQL in `scripts/import-fhrs/src/import.ts` or `scripts/import-dishes/src/import.ts`. Array columns travel as jsonb and are unpacked with `jsonb_array_elements_text`, because `jsonb_to_recordset` can't cast JSON arrays to `text[]`.
- **The dish import never overwrites non-APPROVED dishes.** If a user-requested dish already holds a catalogue slug, that catalogue dish is skipped and reported as conflicting.
- **Catalogue dish slugs must stay stable across re-imports.** The import upserts by slug and never deletes, so a changed slug creates a duplicate dish and strands the old one along with its ratings. That's why merged groups without an unsuffixed entry fall back to their alphabetically first source id, never to the "main" version, which shifts with cuisine votes and mention counts. Re-imports report approved dishes missing from the catalogue as `staleDishes` — investigate before deleting any.
- **Don't remove the import's close guards.** It refuses to close restaurants when a feed is incomplete or would close more than remain; without that, one bad API response would soft-close a whole borough.
- **Pinned versions are deliberate:** pnpm 10 (corepack 0.32 can't run pnpm 12), TypeScript 6.0 (typescript-eslint doesn't support TS 7), Vitest 4 (Vitest 5 excludes Node 25), Prisma 7.10 (npm's `latest` tag points at an 8.0 RC). Recheck these before bumping.
- **Node 25 prints a Prisma "unsupported Node version" warning** — harmless locally; CI uses Node 24.
- **CLAUDE.md is in `.prettierignore`** so `pnpm format` doesn't reflow it.

## 11. Keeping This File Current

This file is a living document, not a one-time setup step. Update it whenever:

- The tech stack, structure, or conventions change (e.g. if tRPC is dropped for REST/GraphQL)
- A new gotcha or "don't touch" zone is discovered
- The domain model changes (new entities, changed relationships)
- A recurring mistake suggests a missing instruction here

If you (the agent) notice this file is out of date with the actual codebase, say so before proceeding.
