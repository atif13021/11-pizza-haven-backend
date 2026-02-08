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

// ---------------- POSTGRES CONNECTION ----------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Railway requirement
});

// Test DB connection
pool.query("SELECT 1")
  .then(() => console.log("PostgreSQL connected"))
  .catch(err => console.error("Database connection error:", err));

// ---------------- MIDDLEWARE ----------------
const allowedOrigins = ["http://localhost:3000"];
if (process.env.FRONTEND_URL) allowedOrigins.push(process.env.FRONTEND_URL);

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET || "fallbackSecret",
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 1000 * 60 * 60 }
}));

// ---------------- ADMIN LOGIN ----------------
const adminUser = {
  username: "Owner",
  passwordHash: "$2a$10$Yk.2KdOdPUENankA9Y.p8.oRkqAO0vQfJB.msmQG4Fh.tLopedroW" // admin123
};

const adminAuth = (req, res, next) => {
  if (req.session.admin) return next();
  res.status(401).json({ success: false });
};

// ---------------- ROUTES ----------------

// Admin login/logout
app.post("/admin/login", async (req, res) => {
  const { username, password } = req.body;
  if (username === adminUser.username) {
    const match = await bcrypt.compare(password, adminUser.passwordHash);
    if (match) {
      req.session.admin = true;
      return res.json({ success: true });
    }
  }
  res.status(401).json({ success: false });
});

app.post("/admin/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// Pizzas
app.get("/api/pizzas", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM pizzas ORDER BY id");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/api/pizzas", adminAuth, async (req, res) => {
  const { name, price, image } = req.body;
  try {
    await pool.query(
      "INSERT INTO pizzas (name, price, image) VALUES ($1, $2, $3)",
      [name, Number(price), image]
    );
    res.json({ message: "Pizza added" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

app.delete("/api/pizzas/:id", adminAuth, async (req, res) => {
  try {
    await pool.query("DELETE FROM pizzas WHERE id=$1", [req.params.id]);
    res.json({ message: "Deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// Orders
app.get("/api/orders", adminAuth, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM orders ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/api/orders", async (req, res) => {
  const { name, phone, address, items, total, paymentMethod } = req.body;
  const paymentStatus = paymentMethod === "COD" ? "COD" : "Pending";
  try {
    const result = await pool.query(
      `INSERT INTO orders 
       (name, phone, address, items, total, payment_method, payment_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id`,
      [name, phone, address, JSON.stringify(items), total, paymentMethod, paymentStatus]
    );
    res.json({
      orderId: result.rows[0].id,
      paymentRequired: paymentMethod !== "COD"
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/api/confirm-payment/:id", async (req, res) => {
  const { transactionId = "N/A" } = req.body;
  try {
    const result = await pool.query(
      "UPDATE orders SET transaction_id=$1, payment_status='Paid' WHERE id=$2",
      [transactionId, req.params.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ success: false });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

app.patch("/api/orders/:id", adminAuth, async (req, res) => {
  const { status } = req.body;
  try {
    const result = await pool.query("UPDATE orders SET status=$1 WHERE id=$2", [status, req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ success: false });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

app.delete("/api/orders/:id", adminAuth, async (req, res) => {
  try {
    await pool.query("DELETE FROM orders WHERE id=$1", [req.params.id]);
    res.json({ message: "Deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// Messages
app.get("/api/messages", adminAuth, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM messages ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/api/messages", async (req, res) => {
  const { name, email, message } = req.body;
  try {
    await pool.query("INSERT INTO messages (name, email, message) VALUES ($1,$2,$3)", [name, email, message]);
    res.json({ message: "Saved" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

app.delete("/api/messages/:id", adminAuth, async (req, res) => {
  try {
    await pool.query("DELETE FROM messages WHERE id=$1", [req.params.id]);
    res.json({ message: "Deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// ---------------- START SERVER ----------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
