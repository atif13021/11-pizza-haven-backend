// backend/createTables.js
import pkg from "pg";
import dotenv from "dotenv";
dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Required for Railway
});

const createTables = async () => {
  try {
    // ---------------- PIZZAS ----------------
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pizzas (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        price NUMERIC NOT NULL,
        image TEXT
      )
    `);

    // ---------------- ORDERS ----------------
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        phone VARCHAR(20),
        address TEXT,
        items JSON,
        total NUMERIC,
        payment_method VARCHAR(50),
        payment_status VARCHAR(20),
        transaction_id VARCHAR(100),
        status VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ---------------- MESSAGES ----------------
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        email VARCHAR(100),
        message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log("All tables created successfully!");
    process.exit();
  } catch (err) {
    console.error("Error creating tables:", err);
    process.exit(1);
  }
};

createTables();
