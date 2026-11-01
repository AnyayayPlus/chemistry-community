import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, extname, resolve, sep } from "node:path";

const password = process.env.ADMIN_PASSWORD;
if (!password || password.length < 12)
  throw new Error("Set ADMIN_PASSWORD to at least 12 characters");
const dbPath = process.env.DATABASE_PATH || "./data/community.sqlite";
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(
  `CREATE TABLE IF NOT EXISTS entries (id INTEGER PRIMARY KEY, category TEXT NOT NULL, position INTEGER NOT NULL, name TEXT NOT NULL, email TEXT, amount_cents INTEGER, currency TEXT, date TEXT, message TEXT, avatar TEXT, title TEXT, links TEXT, visible INTEGER NOT NULL DEFAULT 1)`,
);
const sessions = new Map();
const attempts = new Map();
const allowed = new Set(["members", "feedbackers", "appreciators"]);
const json = (res, status, data, extra = {}) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extra,
  });
  res.end(JSON.stringify(data));
};
const decode = (row) => ({
  ...row,
  links: row.links ? JSON.parse(row.links) : [],
  visible: Boolean(row.visible),
});
const list = () =>
  db.prepare("SELECT * FROM entries ORDER BY category, position, id").all().map(decode);
const secretHash = createHash("sha256").update(password).digest();
const staticDir = resolve("dist");
const server = http.createServer(async (req, res) => {
  try {
    const path = new URL(req.url, "http://localhost").pathname;
    if (path === "/api/public" && req.method === "GET") {
      const result = { members: [], feedbackers: [], appreciators: [] };
      for (const r of list().filter((r) => r.visible)) {
        if (r.category === "members")
          result.members.push({ name: r.name, avatar: r.avatar, title: r.title, links: r.links });
        if (r.category === "feedbackers") result.feedbackers.push({ name: r.name });
        if (r.category === "appreciators")
          result.appreciators.push({
            name: r.name,
            amount: `${(r.amount_cents / 100).toFixed(2)} ${r.currency}`,
            date: r.date,
            message: r.message,
          });
      }
      return json(res, 200, result, { "Access-Control-Allow-Origin": "*" });
    }
    if (path.startsWith("/api/")) {
      if (!["GET", "HEAD"].includes(req.method)) {
        const origin = req.headers.origin;
        if (origin && new URL(origin).host !== req.headers.host)
          return json(res, 403, { error: "请求来源不允许" });
      }
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 65536) return json(res, 413, { error: "内容过大" });
      }
      let input = {};
      if (body) {
        try {
          input = JSON.parse(body);
        } catch {
          return json(res, 400, { error: "JSON 格式错误" });
        }
      }
      if (path === "/api/login" && req.method === "POST") {
        const ip = req.socket.remoteAddress;
        const previous = attempts.get(ip) || [];
        const recent = previous.filter((t) => Date.now() - t < 15 * 60 * 1000);
        if (recent.length >= 10) return json(res, 429, { error: "尝试次数过多，请稍后再试" });
        const supplied = createHash("sha256")
          .update(String(input.password || ""))
          .digest();
        if (!timingSafeEqual(secretHash, supplied)) {
          attempts.set(ip, [...recent, Date.now()]);
          return json(res, 401, { error: "密码错误" });
        }
        attempts.delete(ip);
        const token = randomBytes(32).toString("hex");
        sessions.set(token, Date.now() + 12 * 60 * 60 * 1000);
        return json(
          res,
          200,
          { ok: true },
          {
            "Set-Cookie": `session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
          },
        );
      }
      const token = (req.headers.cookie || "")
        .split(";")
        .map((x) => x.trim())
        .find((x) => x.startsWith("session="))
        ?.slice(8);
      if (!token || !sessions.has(token) || sessions.get(token) < Date.now()) {
        if (token) sessions.delete(token);
        return json(res, 401, { error: "请先登录" });
      }
      if (path === "/api/logout" && req.method === "POST") {
        sessions.delete(token);
        return json(
          res,
          200,
          { ok: true },
          { "Set-Cookie": "session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" },
        );
      }
      if (path === "/api/entries" && req.method === "GET") return json(res, 200, list());
      const match = path.match(/^\/api\/entries(?:\/(\d+))?$/);
      if (match && req.method === "DELETE" && match[1]) {
        const result = db.prepare("DELETE FROM entries WHERE id=?").run(Number(match[1]));
        return json(res, result.changes ? 200 : 404, { ok: !!result.changes });
      }
      if (match && ((req.method === "POST" && !match[1]) || (req.method === "PUT" && match[1]))) {
        const {
          category,
          name,
          email,
          amount_cents,
          currency,
          date,
          message,
          avatar,
          title,
          links,
          visible,
          position,
        } = input;
        const text = (v) => (v == null || v === "" ? null : String(v));
        if (
          !allowed.has(category) ||
          typeof name !== "string" ||
          !name.trim() ||
          name.length > 200 ||
          !Number.isSafeInteger(position) ||
          position < 0 ||
          (category === "appreciators" &&
            (!Number.isSafeInteger(amount_cents) || amount_cents < 0 || currency !== "CNY")) ||
          !Array.isArray(links) ||
          links.some(
            (l) =>
              !l ||
              typeof l.icon !== "string" ||
              typeof l.link !== "string" ||
              !/^https:\/\//.test(l.link),
          )
        )
          return json(res, 400, { error: "请检查名称、排序、金额和链接" });
        if (
          avatar &&
          !(avatar.startsWith("/") && !avatar.startsWith("//")) &&
          !/^https:\/\//.test(avatar)
        )
          return json(res, 400, { error: "头像必须是站内路径或 HTTPS 地址" });
        const values = [
          category,
          position,
          name.trim(),
          text(email),
          category === "appreciators" ? amount_cents : null,
          category === "appreciators" ? "CNY" : null,
          text(date),
          text(message),
          text(avatar),
          text(title),
          JSON.stringify(links),
          visible ? 1 : 0,
        ];
        if (match[1]) {
          const result = db
            .prepare(
              "UPDATE entries SET category=?,position=?,name=?,email=?,amount_cents=?,currency=?,date=?,message=?,avatar=?,title=?,links=?,visible=? WHERE id=?",
            )
            .run(...values, Number(match[1]));
          return json(res, result.changes ? 200 : 404, { ok: !!result.changes });
        }
        const result = db
          .prepare(
            "INSERT INTO entries(category,position,name,email,amount_cents,currency,date,message,avatar,title,links,visible) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
          )
          .run(...values);
        return json(res, 201, { id: result.lastInsertRowid });
      }
      return json(res, 404, { error: "接口不存在" });
    }
    if (req.method !== "GET") return json(res, 405, { error: "不支持的请求" });
    const requested = resolve(staticDir, `.${decodeURIComponent(path)}`);
    if (!requested.startsWith(staticDir + sep) && requested !== staticDir)
      return json(res, 403, { error: "禁止访问" });
    const file =
      existsSync(requested) && extname(requested) ? requested : resolve(staticDir, "index.html");
    if (!existsSync(file)) return json(res, 404, { error: "请先构建前端" });
    const mime = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".svg": "image/svg+xml",
    };
    res.writeHead(200, {
      "Content-Type": mime[extname(file)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(readFileSync(file));
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, 500, { error: "服务器错误" });
    else res.end();
  }
});
server.listen(Number(process.env.PORT || 3000), process.env.HOST || "127.0.0.1", () =>
  console.log("Community service listening"),
);
