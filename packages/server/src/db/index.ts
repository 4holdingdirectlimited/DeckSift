import { Pool } from "pg";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

// Standard node-postgres Pool. Works against a local PostgreSQL
// (packages/server/sql/local-bootstrap.sql); the RLS-supporting objects
// (auth_is_org_member(), the `authenticated` role) are database-side, not
// driver-side.
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
export const db = drizzle(pool, { schema });
export { pool };

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function authQuery<T>(
  jwtClaims: string,
  callback: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // Role switch is intentionally disabled: the app's pool connects as the
    // table owner (which bypasses RLS anyway), and re-enabling it would break
    // the sync/admin writes to `cards` (crudPolicy modify: false). Org
    // isolation is enforced at the route layer via requireOrg + org-scoped
    // queries. The RLS policies remain as defense-in-depth for any future
    // deployment that does run under the `authenticated` role.
    // await tx.execute(sql`SET LOCAL ROLE authenticated`);
    await tx.execute(
      sql`SELECT set_config('request.jwt.claims', ${jwtClaims}, true)`,
    );
    return callback(tx);
  });
}
