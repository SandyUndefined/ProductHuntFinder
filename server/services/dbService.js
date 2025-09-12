const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// Initialize PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.DATABASE_URL &&
    process.env.DATABASE_URL.includes('sslmode=require')
      ? { rejectUnauthorized: false }
      : false,
});

// Columns available in the products table
const PRODUCT_COLUMNS = [
  'id',
  'name',
  'description',
  'category',
  'publishedAt',
  'phLink',
  'makerName',
  'status',
  'createdAt',
  'updatedAt',
  'linkedin',
  'upvotes',
  'phVotes',
  'phDayRank',
  'phTopics',
  'companyWebsite',
  'companyInfo',
  'launchDate',
  'accelerator',
  'phGithub',
  'phEnrichedAt',
  'approvedAt',
  'syncedToSheets',
  'syncedToSheetsAt',
  'thumbnail',
];

class DatabaseService {
  constructor() {
    this.kvInitialized = false;
  }

  async ensureKvTable() {
    if (this.kvInitialized) return;
    await pool.query(
      'CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value JSONB)'
    );
    this.kvInitialized = true;
  }

  /**
   * Retrieve a product or generic key-value item
   * @param {string} key
   * @returns {Promise<any|null>}
   */
  async getItem(key) {
    if (key.startsWith('product:')) {
      const id = key.replace('product:', '');
      try {
        const res = await pool.query('SELECT * FROM products WHERE id=$1', [id]);
        return res.rows[0] || null;
      } catch (err) {
        console.error('Postgres getItem error:', err.message);
        return null;
      }
    }

    await this.ensureKvTable();
    try {
      const res = await pool.query('SELECT value FROM kv_store WHERE key=$1', [key]);
      return res.rows[0] ? res.rows[0].value : null;
    } catch (err) {
      console.error('KV getItem error:', err.message);
      return null;
    }
  }

  /** Save a key/value pair */
  async setItem(key, value) {
    await this.ensureKvTable();
    try {
      await pool.query(
        'INSERT INTO kv_store(key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = $2',
        [key, value]
      );
      return true;
    } catch (err) {
      console.error('KV setItem error:', err.message);
      return false;
    }
  }

  /** Get keys matching a pattern */
  async getKeysByPattern(pattern) {
    await this.ensureKvTable();
    const sqlPattern = pattern.replace('*', '%');
    try {
      const res = await pool.query('SELECT key FROM kv_store WHERE key LIKE $1', [
        sqlPattern,
      ]);
      return res.rows.map((r) => r.key);
    } catch (err) {
      console.error('KV getKeysByPattern error:', err.message);
      return [];
    }
  }

  /** Delete a key-value entry */
  async deleteItem(key) {
    await this.ensureKvTable();
    try {
      await pool.query('DELETE FROM kv_store WHERE key=$1', [key]);
      return true;
    } catch (err) {
      console.error('KV deleteItem error:', err.message);
      return false;
    }
  }

  /**
   * Insert or update a product based on phLink
   * @param {Object} product
   * @returns {Promise<Object>}
   */
  async saveProduct(product) {
    const existing = await pool.query('SELECT id FROM products WHERE phLink=$1', [
      product.phLink,
    ]);

    if (existing.rows.length) {
      return this.updateProductFields(existing.rows[0].id, product);
    }

    const now = new Date().toISOString();
    const data = {
      id: product.id || uuidv4(),
      status: product.status || 'pending',
      createdAt: now,
      updatedAt: now,
      ...product,
    };

    const cols = [];
    const vals = [];
    const placeholders = [];
    for (const col of PRODUCT_COLUMNS) {
      if (data[col] !== undefined) {
        cols.push(col);
        vals.push(data[col]);
        placeholders.push(`$${vals.length}`);
      }
    }

    const query = `INSERT INTO products (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
    const res = await pool.query(query, vals);
    return res.rows[0];
  }

  async getAllProducts() {
    const res = await pool.query('SELECT * FROM products ORDER BY createdAt DESC');
    return res.rows;
  }

  async getProductsByCategory(category) {
    const res = await pool.query(
      'SELECT * FROM products WHERE category=$1 ORDER BY createdAt DESC',
      [category]
    );
    return res.rows;
  }

  async getProductsByStatus(status) {
    const res = await pool.query(
      'SELECT * FROM products WHERE status=$1 ORDER BY createdAt DESC',
      [status]
    );
    return res.rows;
  }

  /** Partially update product fields */
  async updateProductFields(id, fields) {
    const now = new Date().toISOString();
    const data = { ...fields, updatedAt: now };

    const sets = [];
    const values = [];
    let idx = 1;
    for (const col of PRODUCT_COLUMNS) {
      if (data[col] !== undefined) {
        sets.push(`${col} = $${idx}`);
        values.push(data[col]);
        idx++;
      }
    }

    if (!sets.length) {
      const res = await pool.query('SELECT * FROM products WHERE id=$1', [id]);
      return res.rows[0] || null;
    }

    values.push(id);
    const query = `UPDATE products SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`;
    const res = await pool.query(query, values);
    return res.rows[0];
  }

  /** Update Product Hunt specific enrichment details */
  async updateProductPhDetails(id, details) {
    const allowed = [
      'phDayRank',
      'phTopics',
      'companyWebsite',
      'companyInfo',
      'launchDate',
      'accelerator',
      'linkedin',
      'phGithub',
      'thumbnail',
      'phEnrichedAt',
    ];
    const filtered = {};
    for (const key of allowed) {
      if (details[key] !== undefined) filtered[key] = details[key];
    }
    return this.updateProductFields(id, filtered);
  }

  /**
   * Additional helpers used by various services
   */
  async getStats() {
    const total = await pool.query('SELECT COUNT(*) FROM products');
    const byCategory = await pool.query(
      'SELECT category, COUNT(*) FROM products GROUP BY category'
    );
    const byStatus = await pool.query(
      'SELECT status, COUNT(*) FROM products GROUP BY status'
    );

    return {
      total: parseInt(total.rows[0].count, 10),
      byCategory: Object.fromEntries(
        byCategory.rows.map((r) => [r.category, parseInt(r.count, 10)])
      ),
      byStatus: Object.fromEntries(
        byStatus.rows.map((r) => [r.status, parseInt(r.count, 10)])
      ),
    };
  }

  async getApprovedProductsNeedingSync() {
    const res = await pool.query(
      "SELECT * FROM products WHERE status='approved' AND (syncedToSheets IS NULL OR syncedToSheets = false)"
    );
    return res.rows;
  }

  async getProductsNeedingEnrichment() {
    const res = await pool.query(
      "SELECT * FROM products WHERE linkedin IS NULL OR TRIM(linkedin) = ''"
    );
    return res.rows;
  }

  async updateProductLinkedIn(id, linkedin) {
    return this.updateProductFields(id, { linkedin });
  }
}

module.exports = new DatabaseService();

