import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
test("authentication, CRUD and public privacy", async () => {
  const dir = mkdtempSync(join(tmpdir(), "community-test-"));
  const port = 32117;
  const child = spawn(process.execPath, ["server/index.mjs"], {
    env: {
      ...process.env,
      ADMIN_PASSWORD: "test-password-123",
      DATABASE_PATH: join(dir, "db.sqlite"),
      PORT: String(port),
    },
  });
  const base = `http://127.0.0.1:${port}`;
  try {
    for (let i = 0; i < 50; i++) {
      try {
        await fetch(base + "/api/public");
        break;
      } catch {
        await delay(100);
      }
    }
    let r = await fetch(base + "/api/entries");
    assert.equal(r.status, 401);
    r = await fetch(base + "/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "test-password-123" }),
    });
    assert.equal(r.status, 200);
    const cookie = r.headers.get("set-cookie").split(";")[0];
    const entry = {
      category: "appreciators",
      position: 0,
      name: "测试",
      email: "private@example.com",
      amount_cents: 520,
      currency: "CNY",
      date: "2026-01-01",
      message: "谢谢",
      links: [],
      visible: true,
    };
    r = await fetch(base + "/api/entries", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(entry),
    });
    assert.equal(r.status, 201);
    const { id } = await r.json();
    r = await fetch(base + "/api/public");
    const result = await r.json();
    assert.equal(result.appreciators[0].amount, "5.20 CNY");
    assert.ok(!JSON.stringify(result).includes("private@example.com"));
    r = await fetch(base + `/api/entries/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ ...entry, visible: false }),
    });
    assert.equal(r.status, 200);
    r = await fetch(base + "/api/public");
    assert.equal((await r.json()).appreciators.length, 0);
    r = await fetch(base + `/api/entries/${id}`, { method: "DELETE", headers: { cookie } });
    assert.equal(r.status, 200);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await new Promise((resolve) => child.once("exit", resolve));
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
