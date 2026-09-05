const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');
require('dotenv').config();

const dbPath = path.resolve(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Không thể kết nối SQLite:', err.message);
  } else {
    console.log('✅ Đã kết nối cơ sở dữ liệu SQLite: database.db');
  }
});

// Kích hoạt ràng buộc khóa ngoại (Foreign Keys) trong SQLite
db.serialize(() => {
  db.run('PRAGMA foreign_keys = ON');

  // 1. Bảng Users
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      is_locked INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 2. Bảng Genres (Thể loại)
  db.run(`
    CREATE TABLE IF NOT EXISTS genres (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      slug TEXT UNIQUE NOT NULL
    )
  `);

  // 3. Bảng Movies (Phim)
  db.run(`
    CREATE TABLE IF NOT EXISTS movies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT,
      poster_url TEXT,
      banner_url TEXT,
      release_year INTEGER,
      genre_id INTEGER,
      views INTEGER DEFAULT 0,
      is_featured INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (genre_id) REFERENCES genres (id) ON DELETE SET NULL
    )
  `);

  // 4. Bảng Episodes (Tập phim)
  db.run(`
    CREATE TABLE IF NOT EXISTS episodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      movie_id INTEGER NOT NULL,
      episode_number INTEGER NOT NULL,
      title TEXT,
      video_url TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(movie_id, episode_number),
      FOREIGN KEY (movie_id) REFERENCES movies (id) ON DELETE CASCADE
    )
  `);

  // 5. Bảng Favorites (Phim yêu thích)
  db.run(`
    CREATE TABLE IF NOT EXISTS favorites (
      user_id INTEGER NOT NULL,
      movie_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, movie_id),
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (movie_id) REFERENCES movies (id) ON DELETE CASCADE
    )
  `);

  // 6. Bảng Watch History (Lịch sử xem)
  db.run(`
    CREATE TABLE IF NOT EXISTS watch_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      movie_id INTEGER NOT NULL,
      episode_id INTEGER,
      watched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (movie_id) REFERENCES movies (id) ON DELETE CASCADE,
      FOREIGN KEY (episode_id) REFERENCES episodes (id) ON DELETE SET NULL
    )
  `);

  // Chèn dữ liệu mẫu cho Thể loại phim
  const defaultGenres = [
    ['Hành Động', 'hanh-dong'],
    ['Tình Cảm', 'tinh-cam'],
    ['Cổ Trang', 'co-trang'],
    ['Khoa Học Viễn Tưởng', 'khoa-hoc-vien-tuong'],
    ['Kinh Dị', 'kinh-di'],
    ['Hoạt Hình', 'hoat-hinh']
  ];

  const insertGenreStmt = db.prepare(`INSERT OR IGNORE INTO genres (name, slug) VALUES (?, ?)`);
  defaultGenres.forEach(([name, slug]) => {
    insertGenreStmt.run(name, slug);
  });
  insertGenreStmt.finalize();

  // Khởi tạo tài khoản Admin mặc định nếu chưa tồn tại
  const adminUser = process.env.ADMIN_DEFAULT_USER || 'admin';
  const adminEmail = process.env.ADMIN_DEFAULT_EMAIL || 'admin@anmocnhien.vn';
  const adminPass = process.env.ADMIN_DEFAULT_PASS || 'Admin@123456';

  db.get('SELECT id FROM users WHERE role = ?', ['admin'], async (err, row) => {
    if (err) {
      console.error('Lỗi kiểm tra admin:', err.message);
      return;
    }
    if (!row) {
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(adminPass, saltRounds);
      db.run(
        `INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, 'admin')`,
        [adminUser, adminEmail, hashedPassword],
        (insertErr) => {
          if (insertErr) {
            console.error('Lỗi tạo tài khoản admin mặc định:', insertErr.message);
          } else {
            console.log('👑 Đã tạo tài khoản Admin mặc định:');
            console.log(`   - Username: ${adminUser}`);
            console.log(`   - Password: ${adminPass}`);
          }
        }
      );
    }
  });
});
// Bảng lưu phim yêu thích
  db.run(`
    CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      movie_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, movie_id),
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(movie_id) REFERENCES movies(id)
    )
  `);

module.exports = db;