// backend/server.js
import express from "express";
import cors from "cors";
import session from "express-session";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import pkg from "pg";

dotenv.config();
const { Pool } = pkg;

const app = express();

/* ================= DATABASE ================= */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

// Test DB connection
(async () => {
  try {
    const res = await pool.query("SELECT NOW()");
    console.log("✅ PostgreSQL connected:", res.rows[0]);
  } catch (err) {
    console.error("❌ PostgreSQL connection failed:", err);
  }
})();

/* ================= MIDDLEWARE ================= */
app.use(express.json());

app.use(
  cors({
    origin: ["http://localhost:3000", "https://11pizzahaven.netlify.app"],
    credentials: true,
  })
);

app.set("trust proxy", 1); // required for secure cookies behind proxies

app.use(
  session({
    name: "pizza.sid",
    secret: process.env.SESSION_SECRET || "mysupersecret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // true on HTTPS
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 1000 * 60 * 60, // 1 hour
    },
  })
);

/* ================= ADMIN ================= */
const adminUser = {
  username: "Owner",
  // bcrypt hash of password "Atif123"
  passwordHash: "$2a$12$eJsy0AZdlsajWH4wCXGKD.1ZQ5b6xe9PGRwG6HlgTcddSKP3rEpnC",
};

// Protect admin routes
const adminAuth = (req, res, next) => {
  if (req.session.admin) return next();
  return res.status(401).json({ error: "Unauthorized" });
};

/* ================= LOGIN / LOGOUT ================= */
app.post("/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (username !== adminUser.username)
      return res.status(401).json({ success: false });

    const match = await bcrypt.compare(password, adminUser.passwordHash);
    if (!match) return res.status(401).json({ success: false });

    req.session.admin = true;
    res.json({ success: true });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ success: false });
  }
});

app.post("/admin/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("pizza.sid", {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    });
    res.json({ success: true });
  });
});

/* ================= PIZZAS ================= */
// Public GET
app.get("/api/pizzas", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM pizzas ORDER BY id");
    res.json(Array.isArray(rows) ? rows : []);
  } catch (err) {
    console.error("GET PIZZAS ERROR:", err);
    res.status(500).json([]);
  }
});

// Admin CRUD
app.post("/api/pizzas", adminAuth, async (req, res) => {
  try {
    const { name, price, image } = req.body;
    if (!name || !price || !image) return res.status(400).json({ error: "Missing fields" });

    await pool.query("INSERT INTO pizzas (name, price, image) VALUES ($1,$2,$3)", [
      name,
      Number(price),
      image,
    ]);
    res.json({ success: true });
  } catch (err) {
    console.error("ADD PIZZA ERROR:", err);
    res.status(500).json({ error: "Failed to add pizza" });
  }
});

app.delete("/api/pizzas/:id", adminAuth, async (req, res) => {
  try {
    await pool.query("DELETE FROM pizzas WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE PIZZA ERROR:", err);
    res.status(500).json({ success: false });
  }
});

/* ================= ORDERS ================= */
// Public POST (anyone can order)
app.post("/api/orders", async (req, res) => {
  try {
    const { name, phone, address, items, total, paymentMethod } = req.body;
    const payment_method = paymentMethod || "COD";
    const payment_status = payment_method === "COD" ? "Paid" : "Pending";

    const { rows } = await pool.query(
      `INSERT INTO orders
      (name, phone, address, items, total, payment_method, payment_status)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING id`,
      [name, phone, address, JSON.stringify(items), total, payment_method, payment_status]
    );

    res.json({ orderId: rows[0].id, paymentRequired: payment_method !== "COD" });
  } catch (err) {
    console.error("ADD ORDER ERROR:", err);
    res.status(500).json({ success: false });
  }
});

// Admin GET, PATCH, DELETE
app.get("/api/orders", adminAuth, async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM orders ORDER BY created_at DESC");
    const fixed = rows.map((o) => ({
      ...o,
      items: typeof o.items === "string" ? JSON.parse(o.items) : o.items,
    }));
    res.json(fixed);
  } catch (err) {
    console.error("GET ORDERS ERROR:", err);
    res.status(500).json([]);
  }
});

app.patch("/api/orders/:id", adminAuth, async (req, res) => {
  try {
    const { payment_status } = req.body;
    await pool.query("UPDATE orders SET payment_status=$1 WHERE id=$2", [
      payment_status,
      req.params.id,
    ]);
    res.json({ success: true });
  } catch (err) {
    console.error("UPDATE ORDER ERROR:", err);
    res.status(500).json({ success: false });
  }
});

app.delete("/api/orders/:id", adminAuth, async (req, res) => {
  try {
    await pool.query("DELETE FROM orders WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE ORDER ERROR:", err);
    res.status(500).json({ success: false });
  }
});

/* ================= MESSAGES ================= */
// Public POST (anyone can send message)
app.post("/api/messages", async (req, res) => {
  try {
    const { name, email, message } = req.body;
    await pool.query("INSERT INTO messages (name,email,message) VALUES ($1,$2,$3)", [
      name,
      email,
      message,
    ]);
    res.json({ success: true });
  } catch (err) {
    console.error("ADD MESSAGE ERROR:", err);
    res.status(500).json({ success: false });
  }
});

// Admin GET/DELETE
app.get("/api/messages", adminAuth, async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM messages ORDER BY created_at DESC");
    res.json(rows);
  } catch (err) {
    console.error("GET MESSAGES ERROR:", err);
    res.status(500).json([]);
  }
});

app.delete("/api/messages/:id", adminAuth, async (req, res) => {
  try {
    await pool.query("DELETE FROM messages WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE MESSAGE ERROR:", err);
    res.status(500).json({ success: false });
  }
});

/* ================= HEALTH CHECK ================= */
app.get("/health", (_req, res) => res.json({ status: "ok" }));

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));
