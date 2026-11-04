# Data analysis (SQL on a copy)

The assistant's open-ended analysis path. It runs inside the Electron main
process — no Python, no FastAPI, no second server and no extra port. On a weak
production machine that matters: the only new cost is one read-only SQLite
connection and one snapshot file.

## Flow

1. The first `query_database` tool call lazily copies the live `fastfood.db`
   with SQLite's online `backup()` API into
   `<userData>/analysis/snapshot-*/snapshot.db`.
2. The copy is opened `readonly` with `PRAGMA query_only = ON`.
3. The copy is reused for 5 minutes (`DEFAULT_SNAPSHOT_TTL_MS`), then replaced.
   Stale copies from a crash are pruned when the service starts.
4. Every statement is checked twice: the SQL guard accepts one `SELECT`/`WITH`/
   `VALUES` statement, and SQLite itself refuses writes.
5. Results are scrubbed before they leave the runner: secret-shaped columns
   (`pin`, `hash`, `token`, `api_key`, `cipher`, …) become `••••`, and phone
   columns keep only their last four digits.
6. The copy is closed and deleted when the app quits.

## Weak-device limits

| Limit | Value |
| --- | --- |
| Rows returned to the app | 200 |
| Rows sent to the model | 50 |
| Model payload | ~12 KB, then truncated |
| Longest cell | 2,000 chars |
| Snapshot lifetime | 5 minutes |
| Extra processes | none |

## Surfaces

- **Desktop screen** — `src/components/pages/AnalysisPage.tsx` (`التحليل` in the
  admin sidebar): an Ask tab, a SQL console, and a searchable schema panel.
- **Assistant tool** — `query_database` (`src/ai/tools/sql.ts`), always exposed
  in the core tool set, admin-only through `asOwner`.
- **Ask path** — `src/analysis/ask.ts`: the same provider/key the assistant uses,
  with the daily token budget checked and usage recorded. It returns the question,
  the answer, every SQL query, and a full `trace`: per-step text, reasoning,
  tool calls, tool outputs, token usage and finish reason, plus the model,
  table count and duration. The screen renders that as a timeline and can copy
  the whole trace as JSON.
  The prompt carries a business glossary, read-only SQL rules and examples, the
  local date/time, currency/tax and snapshot time, and a schema with row counts
  and foreign keys. It understands Arabic (including Egyptian colloquial),
  English and mixed input, and answers in the question's language. Internal
  `ai_*`/idempotency tables and secret-shaped columns are kept out of it.
- **Backend** — `src/backend/analysis.ts`: `query`, `schema`, `refresh`, `ask`,
  `close`.
- **Desktop IPC** — `analysis:query`, `analysis:schema`, `analysis:refresh`,
  `analysis:ask`.
- **Remote POS** — `GET /analysis/schema`, `POST /analysis/query`,
  `POST /analysis/refresh` on the existing Fastify server, behind the existing
  bearer-token hook.

## Tests

`src/test/analysis-*.test.ts` cover the guard, the row/cell limits, WAL snapshot
isolation, read-only enforcement, and the tool end to end against the migrated
database. Run them with the normal suite:

```bash
npm test
```
