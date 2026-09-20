const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const dataDirectory = path.join(__dirname, 'data');
const dataFile = path.join(dataDirectory, 'store.json');
const { DatabaseSync } = require('node:sqlite');

const databaseFile = path.join(dataDirectory, 'invoices.sqlite');

let database;
let initialized = false;
let updateQueue = Promise.resolve();

function getDatabase() {
  if (!database) {
    fs.mkdirSync(dataDirectory, { recursive: true });
    database = new DatabaseSync(databaseFile);
    database.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin'))
      );

      CREATE TABLE IF NOT EXISTS invoices (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        vendor TEXT NOT NULL,
        amount REAL NOT NULL,
        category TEXT NOT NULL,
        description TEXT,
        invoice_date TEXT NOT NULL,
        image_url TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
  }
  return database;
}

function seedFromJsonIfNeeded(db) {
  if (initialized) return;

  const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (userCount === 0) {
    let legacyStore = null;
    if (fs.existsSync(dataFile)) {
      try {
        legacyStore = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
      } catch (error) {
        throw new Error(`Unable to read legacy data file: ${error.message}`);
      }
    }

    if (!legacyStore?.users?.length && !process.env.ADMIN_PASSWORD) {
      throw new Error('ADMIN_PASSWORD must be set before creating the initial admin account.');
    }
    const users = legacyStore?.users?.length
      ? legacyStore.users
      : [{
        id: 1,
        username: process.env.ADMIN_USERNAME || 'admin',
        password: bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10),
        role: 'admin',
      }];
    const invoices = legacyStore?.invoices ?? [];

    db.exec('BEGIN');
    try {
      const insertUser = db.prepare(
        'INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)',
      );
      for (const user of users) {
        insertUser.run(user.id, user.username, user.password, user.role === 'admin' ? 'admin' : 'user');
      }

      const insertInvoice = db.prepare(`
        INSERT INTO invoices
          (id, user_id, title, vendor, amount, category, description, invoice_date, image_url, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const invoice of invoices) {
        insertInvoice.run(
          invoice.id,
          invoice.user_id,
          invoice.title,
          invoice.vendor,
          Number(invoice.amount || 0),
          invoice.category,
          invoice.description || null,
          invoice.invoice_date,
          invoice.image_url || null,
          invoice.created_at || new Date().toISOString(),
        );
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  initialized = true;
}

function ensureDatabase() {
  const db = getDatabase();
  seedFromJsonIfNeeded(db);
  return db;
}

function readStoreSync() {
  const db = ensureDatabase();
  const users = db.prepare('SELECT id, username, password, role FROM users ORDER BY id').all();
  const invoices = db.prepare(`
    SELECT id, user_id, title, vendor, amount, category, description,
           invoice_date, image_url, created_at
    FROM invoices
    ORDER BY id
  `).all();
  const nextUserId = (users.at(-1)?.id ?? 0) + 1;
  const nextInvoiceId = (invoices.at(-1)?.id ?? 0) + 1;
  return { nextUserId, nextInvoiceId, users, invoices };
}

function writeStoreSync(store) {
  const db = ensureDatabase();
  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM invoices; DELETE FROM users;');
    const insertUser = db.prepare(
      'INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)',
    );
    for (const user of store.users) {
      insertUser.run(user.id, user.username, user.password, user.role === 'admin' ? 'admin' : 'user');
    }
    const insertInvoice = db.prepare(`
      INSERT INTO invoices
        (id, user_id, title, vendor, amount, category, description, invoice_date, image_url, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const invoice of store.invoices) {
      insertInvoice.run(
        invoice.id,
        invoice.user_id,
        invoice.title,
        invoice.vendor,
        Number(invoice.amount || 0),
        invoice.category,
        invoice.description || null,
        invoice.invoice_date,
        invoice.image_url || null,
        invoice.created_at || new Date().toISOString(),
      );
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

async function readStore() {
  return readStoreSync();
}

async function updateStore(update) {
  const operation = updateQueue.then(async () => {
    const store = readStoreSync();
    const result = await update(store);
    writeStoreSync(store);
    return result;
  });
  updateQueue = operation.catch(() => undefined);
  return operation;
}

module.exports = { readStore, updateStore, databaseFile };
