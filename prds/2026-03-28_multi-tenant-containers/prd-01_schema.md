# PRD-01: Database Schema Evolution

**Status**: 🔲 Todo
**File**: `mercury-cloud-console/src/lib/db/schema.ts`
**Blocks**: All other PRDs

---

## Tasks

### Task 1: Add `compute_nodes` table

##### MODIFY: `mercury-cloud-console/src/lib/db/schema.ts`

Add a new table:

```ts
export const computeNodes = sqliteTable("compute_nodes", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  host: text("host").notNull(),
  apiUrl: text("api_url").notNull(),
  apiToken: text("api_token").notNull(),
  maxAgents: integer("max_agents").notNull().default(50),
  status: text("status", { enum: ["active", "draining", "offline"] }).notNull().default("active"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
```

**Done when**: `bun run db:push` succeeds, table visible in DB.

---

### Task 2: Extend `agents` table

##### MODIFY: `mercury-cloud-console/src/lib/db/schema.ts`

Add columns to the existing `agents` table:

```ts
nodeId: text("node_id").references(() => computeNodes.id),
containerId: text("container_id"),
containerPort: integer("container_port"),
containerStatus: text("container_status", {
  enum: ["running", "stopped", "restarting", "failed"],
}),
imageTag: text("image_tag"),
```

- Keep `serverId` and `ipv4` nullable (backward compat with existing VPS agents)
- `hostname` should get a default (auto-generated slug) — remove the NOT NULL constraint if present

**Done when**: Existing agents still load without errors; new columns present in schema.

---

### Task 3: Add `container_events` audit table

##### MODIFY: `mercury-cloud-console/src/lib/db/schema.ts`

```ts
export const containerEvents = sqliteTable("container_events", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull().references(() => agents.id),
  event: text("event", {
    enum: ["started", "stopped", "restarted", "failed", "updated"],
  }).notNull(),
  details: text("details", { mode: "json" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
```

**Done when**: Table created, can insert a row manually.

---

### Task 4: Run migration

```bash
cd mercury-cloud-console && bun run db:push
```

**Done when**: No errors, all three changes reflected in DB.

---

## Acceptance Criteria

- [ ] `compute_nodes` table exists with all columns
- [ ] `agents` table has `nodeId`, `containerId`, `containerPort`, `containerStatus`, `imageTag`
- [ ] `container_events` table exists
- [ ] Existing VPS-based agents still load (no broken NOT NULL columns)
- [ ] TypeScript types in `db/index.ts` reflect new schema (run `bun run typecheck`)
