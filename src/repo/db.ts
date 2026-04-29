// Drizzle handle wrapper. The actual better-sqlite3 connection is opened in
// `src/providers/database/sqlite.ts` (cross-cutting libraries live there per
// the no-cross-cutting-import rule); this file just types the handle.

import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

export type Db = BetterSQLite3Database<typeof schema>;

export { schema };
