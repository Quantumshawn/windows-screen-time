// Applies db/schema.sql to a real Postgres database — for production setup, or after adding
// a table in a later change. Safe to re-run anytime (schema.sql is all CREATE TABLE IF NOT
// EXISTS). Usage:
//   DATABASE_URL="postgres://..." node scripts/apply-schema.mjs
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("Set DATABASE_URL to your production Postgres connection string first.");
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(path.join(__dirname, "..", "db", "schema.sql"), "utf-8");

const client = new pg.Client({ connectionString: dbUrl });
await client.connect();
await client.query(schema);
await client.end();

console.log("Schema applied.");
