import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const [source, destination] = process.argv.slice(2);
if (!source || !destination) {
  console.error("Usage: node server/import.mjs <source-data-directory> <new-database-file>");
  process.exit(1);
}
const categories = ["members", "feedbackers", "appreciators"];
const input = Object.fromEntries(
  categories.map((category) => {
    const data = JSON.parse(readFileSync(join(source, `${category}.json`), "utf8"));
    if (!Array.isArray(data[category])) throw new Error(`Invalid ${category} array`);
    return [category, data[category]];
  }),
);
for (const [category, rows] of Object.entries(input)) {
  for (const [index, row] of rows.entries()) {
    if (!row || typeof row.name !== "string" || !row.name.trim())
      throw new Error(`Invalid name: ${category}[${index}]`);
    if (category === "appreciators" && !/^\d+\.\d{2} CNY$/.test(row.amount))
      throw new Error(`Invalid amount: ${category}[${index}]`);
  }
}
const db = new DatabaseSync(destination);
db.exec(`CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY, category TEXT NOT NULL, position INTEGER NOT NULL,
  name TEXT NOT NULL, email TEXT, amount_cents INTEGER, currency TEXT,
  date TEXT, message TEXT, avatar TEXT, title TEXT, links TEXT, visible INTEGER NOT NULL DEFAULT 1
)`);
if (db.prepare("SELECT COUNT(*) AS count FROM entries").get().count !== 0)
  throw new Error("Database is not empty; refusing to import");
const insert = db.prepare(
  "INSERT INTO entries(category,position,name,email,amount_cents,currency,date,message,avatar,title,links) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
);
db.exec("BEGIN");
try {
  for (const [category, rows] of Object.entries(input)) {
    rows.forEach((row, position) => {
      const amount = row.amount?.match(/^(\d+)\.(\d{2}) CNY$/);
      insert.run(
        category,
        position,
        row.name,
        row.email ?? null,
        amount ? Number(amount[1]) * 100 + Number(amount[2]) : null,
        amount ? "CNY" : null,
        row.date ?? null,
        row.message ?? null,
        row.avatar ?? null,
        row.title ?? null,
        row.links ? JSON.stringify(row.links) : null,
      );
    });
  }
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}
for (const category of categories) console.log(`${category}: ${input[category].length}`);
console.log(
  `appreciation cents: ${db.prepare("SELECT COALESCE(SUM(amount_cents), 0) AS total FROM entries WHERE category = 'appreciators'").get().total}`,
);
db.close();
