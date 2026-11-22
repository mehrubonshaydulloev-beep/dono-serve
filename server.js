const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const Database = require("better-sqlite3");

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || "";
const ORIGIN = process.env.ORIGIN || "*";

const db = new Database("dono.db");
db.exec(`
CREATE TABLE IF NOT EXISTS accounts(
  acc TEXT PRIMARY KEY, name TEXT, addr TEXT, net INTEGER DEFAULT 0,
  reading TEXT, balance REAL DEFAULT 0);
CREATE TABLE IF NOT EXISTS payments(
  id INTEGER PRIMARY KEY AUTOINCREMENT, acc TEXT, bank TEXT, amount REAL,
  ref TEXT, created TEXT DEFAULT CURRENT_TIMESTAMP);
`);

const app = express();
app.use(cors({ origin: ORIGIN }));
app.use(express.json({ limit: "1mb" }));
app.use(express.text({ type: "text/csv", limit: "20mb" }));
app.use(rateLimit({ windowMs: 60_000, max: 60 }));

const isAcc = (s) => /^\d{4,12}$/.test(String(s));

app.get("/api/account/:acc", (req, res) => {
  if (!isAcc(req.params.acc)) return res.status(400).json({ error: "Рақам нодуруст аст" });
  const row = db.prepare("SELECT * FROM accounts WHERE acc=?").get(req.params.acc);
  if (!row) return res.status(404).json({ error: "Литсавой ёфт нашуд" });
  res.json(row);
});

app.post("/api/pay", (req, res) => {
  const { acc, amount, bank } = req.body || {};
  const sum = Number(amount);
  if (!isAcc(acc) || !(sum > 0) || sum > 100000 || !bank)
    return res.status(400).json({ error: "Маълумот нодуруст аст" });
  const row = db.prepare("SELECT balance FROM accounts WHERE acc=?").get(acc);
  if (!row) return res.status(404).json({ error: "Литсавой ёфт нашуд" });
  const ref = "DE" + Date.now();
  db.transaction(() => {
    db.prepare("UPDATE accounts SET balance=balance-? WHERE acc=?").run(sum, acc);
    db.prepare("INSERT INTO payments(acc,bank,amount,ref) VALUES(?,?,?,?)").run(acc, bank, sum, ref);
  })();
  res.json({ ok: true, ref, balance: row.balance - sum });
});

app.post("/api/import", (req, res) => {
  if (!ADMIN_KEY || req.get("x-admin-key") !== ADMIN_KEY)
    return res.status(401).json({ error: "Иҷозат нест" });
  const text = typeof req.body === "string" ? req.body : "";
  const ins = db.prepare(`INSERT INTO accounts(acc,name,addr,net,reading,balance) VALUES(?,?,?,?,?,?)
    ON CONFLICT(acc) DO UPDATE SET name=excluded.name, addr=excluded.addr, net=excluded.net,
    reading=excluded.reading, balance=excluded.balance`);
  let ok = 0;
  db.transaction(() => {
    for (const line of text.split(/\r?\n/)) {
      const p = line.split(";").map((x) => x.trim());
      if (!isAcc(p[0])) continue;
      ins.run(p[0], p[1] || "", p[2] || "", parseInt(p[3], 10) || 0, p[4] || "", parseFloat((p[5] || "0").replace(",", ".")) || 0);
      ok++;
    }
  })();
  res.json({ imported: ok });
});

app.listen(PORT, () => console.log("Dono Energy API: http://localhost:" + PORT));
