# PBE Events - Copilot Instructions

## Architecture Overview

This is a **full-stack monolithic Bun application** with integrated frontend and backend in a single server process. The server is built using **Bun's native HTTP router** (not Express/Hono/etc).

### Tech Stack
- **Runtime**: Bun (replaces Node.js)
- **Backend**: Bun HTTP server with custom routing pattern
- **Frontend**: React 19 with Valtio state management
- **Database**: Postgres via import {sql } from `bun`
- **Styling**: Tailwind CSS v4 + DaisyUI
- **Build**: Bun bundler with `bun-plugin-tailwind`

## Key Patterns

### 1. Route Definition Pattern
Routes are defined as **nested objects** exported from `src/server/routes/*.ts`:

```typescript
export const eventsRoutes: Routes = {
  '/api/events': {
    GET: (req) => { /* handler */ },
    POST: async (req) => { /* handler */ }
  },
  '/api/events/:id': {
    PATCH: async (req: BunRequest<'/api/events/:id'>) => {
      const id = req.params.id; // Type-safe params
    }
  }
};
```

- Merge route objects in `src/server/index.ts` using spread: `routes: { ...authRoutes, ...eventsRoutes }`
- Use `BunRequest<'/path'>` type for route param typing
- All route handlers return `Response` objects (use helpers from `src/server/utils/responses.ts`)

### 2. Database Queries with Bun SQL
Pre-compile queries at module level for performance:

```typescript
const querySelectEvent = db.query<PBEEvent, { $userId: string }>(
  'SELECT * FROM events WHERE userId = $userId'
);

// Later use:
const event = querySelectEvent.get({ $userId: userId }); // Single row
const events = querySelectEvent.all({ $userId: userId }); // Multiple rows
```

- **Always** use parameterized queries with `$` prefix
- Define TypeScript types for query results (first generic) and params (second generic)
- Use `.get()` for single row, `.all()` for multiple, `.run()` for mutations

### 3. State Management with Valtio
Each feature domain has a **Valt class** that wraps a Valtio proxy store:

```typescript
export class EventsValt {
  store: EventsStore;

  constructor() {
    this.store = proxy<EventsStore>({ initialized: false, events: [] });
  }

  async init() {
    // Fetch data and mutate store directly
    this.store.events = await fetchEvents();
  }
}

// Create React context
export const EventsValtContext = createContext<EventsValt>(new EventsValt());
export const useEventsValt = () => useContext(EventsValtContext);
```

- Initialize Valt in component with `useMemo(() => new EventsValt(), [])`
- Read state with `useSnapshot(valt.store)` in components
- Mutate state directly in Valt methods (Valtio handles reactivity)

### 4. Session Management
Session uses cookie-based authentication:
- `getSession(req)` returns `Session | null`
- Sessions stored in Postgres, validated on each request
- Most routes should check `if (!session) return apiUnauthorized()`

### 5. HTML Entry Points
The server uses **nonce-based routing** for HTML pages:
- `app.html` → Mounted at `/${appNounce}` for authenticated users
- `login.html` → Mounted at `/${loginNounce}` for unauthenticated users
- Both load TypeScript via `<script type="module" src="./index.tsx">`
- Bun's bundler handles TypeScript compilation automatically

## Development Commands

```bash
bun dev          # Hot-reload dev server
bun start        # Production mode
bun install      # Install dependencies
```

## Project-Specific Conventions

1. **Import Paths**: Use `@/` alias for `src/` directory (configured in `tsconfig.json`)
2. **UUID Generation**: Use `Bun.randomUUIDv7()` for IDs (not crypto.randomUUID)
3. **Password Hashing**: Use `Bun.password.verify()` and `Bun.password.hash()` (see `src/server/routes/auth.ts`)
4. **File Organization**:
   - Backend routes: `src/server/routes/*.ts`
   - Frontend pages: `src/frontend/app/pages/*/` (each feature has Valt + Components + CSS)
   - Shared components: `src/frontend/components/`

5. **Database Schema**: See `src/server/pbe.sql` for complete schema. Note the permission system:
   - Events have many Users through Permissions
   - Permissions track role: `'owner' | 'admin' | 'judge'`
   - Query helpers in `src/server/queries.ts` enforce permission checks

6. **API Response Format**: All API responses include `{ ok: true }` on success or `{ error: string }` on failure

## Common Tasks

**Add a new route:**
1. Create route file in `src/server/routes/`
2. Export routes object typed as `Routes`
3. Import and spread in `src/server/index.ts`

**Add a new page:**
1. Create page directory in `src/frontend/app/pages/`
2. Create Valt class for state management
3. Import in `App.tsx` router

**Database queries:**
- Always define at module level for reuse
- Reference `src/server/pbe.sql` for accurate table/column names
- Use joins for permission-aware queries (see `src/server/routes/events.ts`)
