require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_LG8Ckb9xDWRY@ep-dry-silence-b3uwmp2u-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

const pool = new Pool({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Không thể kết nối Neon PostgreSQL:');
    console.error(err);
  } else {
    console.log('✅ Đã kết nối cơ sở dữ liệu Neon PostgreSQL thành công!');
    release();
  }
});

// Chuyển đổi cú pháp '?' của SQLite sang '$1, $2...' của PostgreSQL
function formatQuery(sql) {
  let index = 1;
  let converted = sql.replace(/\?/g, () => `$${index++}`);
  converted = converted.replace(/INSERT OR IGNORE INTO/gi, 'INSERT INTO');
  return converted;
}

// Bộ tương thích cho server.js (db.run, db.get, db.all)
const db = {
  pool,
  run(sql, params = [], callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    let convertedSql = formatQuery(sql);
    const isInsert = convertedSql.trim().toUpperCase().startsWith('INSERT');
    if (isInsert && !convertedSql.toUpperCase().includes('RETURNING')) {
      convertedSql += ' RETURNING id';
    }

    pool.query(convertedSql, params, (err, res) => {
      if (callback) {
        const context = {
          lastID: res && res.rows && res.rows[0] ? res.rows[0].id : null,
          changes: res ? res.rowCount : 0
        };
        callback.call(context, err);
      }
    });
  },

  get(sql, params = [], callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    pool.query(formatQuery(sql), params, (err, res) => {
      if (callback) {
        callback(err, res && res.rows ? res.rows[0] : null);
      }
    });
  },

  all(sql, params = [], callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    pool.query(formatQuery(sql), params, (err, res) => {
      if (callback) {
        callback(err, res ? res.rows : []);
      }
    });
  },

  serialize(fn) {
    if (fn) fn();
  }
};

// Khởi tạo bảng và dữ liệu mẫu trên Neon
async function initTables() {
  try {
    // 1. Users
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'user',
        is_locked INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Genres
    await pool.query(`
      CREATE TABLE IF NOT EXISTS genres (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        slug VARCHAR(100) UNIQUE NOT NULL
      );
    `);

    // 3. Movies
    await pool.query(`
      CREATE TABLE IF NOT EXISTS movies (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        slug VARCHAR(255) UNIQUE NOT NULL,
        description TEXT,
        poster_url TEXT,
        banner_url TEXT,
        release_year INTEGER,
        genre_id INTEGER REFERENCES genres(id) ON DELETE SET NULL,
        views INTEGER DEFAULT 0,
        is_featured INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 4. Episodes
    await pool.query(`
      CREATE TABLE IF NOT EXISTS episodes (
        id SERIAL PRIMARY KEY,
        movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
        episode_number INTEGER NOT NULL,
        title VARCHAR(255),
        video_url TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(movie_id, episode_number)
      );
    `);

    // 5. Favorites
    await pool.query(`
      CREATE TABLE IF NOT EXISTS favorites (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, movie_id)
      );
    `);

    // 6. Watch History
    await pool.query(`
      CREATE TABLE IF NOT EXISTS watch_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
        episode_id INTEGER REFERENCES episodes(id) ON DELETE SET NULL,
        watched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Dữ liệu thể loại mặc định
    const defaultGenres = [
      ['Hành Động', 'hanh-dong'],
      ['Tình Cảm', 'tinh-cam'],
      ['Cổ Trang', 'co-trang'],
      ['Khoa Học Viễn Tưởng', 'khoa-hoc-vien-tuong'],
      ['Kinh Dị', 'kinh-di'],
      ['Hoạt Hình', 'hoat-hinh']
    ];

    for (const [name, slug] of defaultGenres) {
      await pool.query(
        `INSERT INTO genres (name, slug) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING;`,
        [name, slug]
      );
    }

    // Tài khoản Admin mặc định
    const adminUser = process.env.ADMIN_DEFAULT_USER || 'admin';
    const adminEmail = process.env.ADMIN_DEFAULT_EMAIL || 'admin@anmocnhien.vn';
    const adminPass = process.env.ADMIN_DEFAULT_PASS || 'Admin@123456';

    const checkAdmin = await pool.query('SELECT id FROM users WHERE role = $1', ['admin']);
    if (checkAdmin.rows.length === 0) {
      const hashedPassword = await bcrypt.hash(adminPass, 10);
      await pool.query(
        `INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, 'admin')`,
        [adminUser, adminEmail, hashedPassword]
      );
      console.log('👑 Đã tạo tài khoản Admin mặc định trên Neon:');
      console.log(`   - Username: ${adminUser}`);
      console.log(`   - Password: ${adminPass}`);
    }
  } catch (err) {
    console.error('❌ Lỗi khởi tạo bảng Neon:');
    console.error(err);
  }
}

initTables();

module.exports = db;