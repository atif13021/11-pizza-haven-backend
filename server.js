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
/* ================= DATABASE ================= */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }  // <- THIS IS REQUIRED for Railway
    : false
});


// Test DB connection (DO NOT exit process on failure in Railway)
(async () => {
  try {
    await pool.query("SELECT 1");
    console.log("✅ PostgreSQL connected");
  } catch (err) {
    console.error("❌ PostgreSQL connection failed:", err);
  }
})();

/* ================= MIDDLEWARE ================= */
app.set("trust proxy", 1); // REQUIRED for Railway + sessions

app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
}));

app.use(express.json());

app.use(session({
  name: "pizza.sid",
  secret: process.env.SESSION_SECRET || "fallback_secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,          // Railway terminates SSL before Node
    httpOnly: true,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60,
  },
}));

/* ================= ADMIN ================= */
const adminUser = {
  username: "Owner",
  passwordHash: "$2a$10$Yk.2KdOdPUENankA9Y.p8.oRkqAO0vQfJB.msmQG4Fh.tLopedroW",
};

const adminAuth = (req, res, next) => {
  if (req.session.admin === true) return next();
  return res.status(401).json({ success: false });
};

app.post("/admin/login", async (req, res) => {
  const { username, password } = req.body;

  if (username !== adminUser.username) {
    return res.status(401).json({ success: false });
  }

  const match = await bcrypt.compare(password, adminUser.passwordHash);
  if (!match) {
    return res.status(401).json({ success: false });
  }

  req.session.admin = true;
  res.json({ success: true });
});

app.post("/admin/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

/* ================= PIZZAS ================= */
app.get("/api/pizzas", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM pizzas ORDER BY id");
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/api/pizzas", adminAuth, async (req, res) => {
  const { name, price, image } = req.body;

  try {
    await pool.query(
      "INSERT INTO pizzas (name, price, image) VALUES ($1,$2,$3)",
      [name, Number(price), image]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

app.delete("/api/pizzas/:id", adminAuth, async (req, res) => {
  try {
    await pool.query("DELETE FROM pizzas WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

/* ================= ORDERS ================= */
app.get("/api/orders", adminAuth, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM orders ORDER BY created_at DESC"
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/api/orders", async (req, res) => {
  const { name, phone, address, items, total, paymentMethod } = req.body;
  const paymentStatus = paymentMethod === "COD" ? "COD" : "Pending";

  try {
    const { rows } = await pool.query(
      `INSERT INTO orders
      (name, phone, address, items, total, payment_method, payment_status)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING id`,
      [
        name,
        phone,
        address,
        JSON.stringify(items),
        total,
        paymentMethod,
        paymentStatus,
      ]
    );

    res.json({
      orderId: rows[0].id,
      paymentRequired: paymentMethod !== "COD",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

/* ================= MESSAGES ================= */
app.get("/api/messages", adminAuth, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM messages ORDER BY created_at DESC"
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/api/messages", async (req, res) => {
  const { name, email, message } = req.body;

  try {
    await pool.query(
      "INSERT INTO messages (name,email,message) VALUES ($1,$2,$3)",
      [name, email, message]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

/* ================= HEALTH ================= */
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

/* ================= START ================= */
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});
