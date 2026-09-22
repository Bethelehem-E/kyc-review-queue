import fs from "node:fs";
import path from "node:path";

// Tests talk to a real Postgres so that database-level guarantees (the
// append-only audit triggers) are covered, not just application code.
const envFile = path.resolve(__dirname, "../.env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const match = /^([A-Z0-9_]+)="?([^"]*)"?$/.exec(line.trim());
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set to run the test suite.");
}
