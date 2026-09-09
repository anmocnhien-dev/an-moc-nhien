const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const db = require('./db');
const { upload } = require('./cloudinary');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'anmocnhien_super_secret_key_2026';

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Phục vụ file tĩnh cho giao diện
app.use(express.static(path.join(__dirname, 'public')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// ==========================================
// 1. MIDDLEWARES XÁC THỰC & PHÂN QUYỀN
// ==========================================
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ status: 'error', message: 'Yêu cầu đăng nhập.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ status: 'error', message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
    }
    req.user = user;
    next();
  });
};

const requireAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ status: 'error', message: 'Từ chối truy cập: Yêu cầu quyền quản trị viên.' });
  }
};

// ==========================================
// 2. HEALTH CHECK
// ==========================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'success',
    message: 'AN MỘC NHIÊN API Server đang hoạt động ổn định.',
    timestamp: new Date().toISOString()
  });
});

// ==========================================
// 3. AUTHENTICATION APIS
// ==========================================

// Đăng ký tài khoản
app.post('/api/auth/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ status: 'error', message: 'Vui lòng điền đầy đủ username, email và password.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    db.run(
      `INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, 'user')`,
      [username.trim(), email.trim().toLowerCase(), hashedPassword],
      function (err) {
        if (err) {
          if (err.message && (err.message.includes('UNIQUE') || err.message.includes('duplicate key') || err.message.includes('unique constraint'))) {
            return res.status(400).json({ status: 'error', message: 'Tên người dùng hoặc email đã tồn tại.' });
          }
          return res.status(500).json({ status: 'error', message: 'Lỗi khi tạo tài khoản: ' + err.message });
        }
        res.status(201).json({ status: 'success', message: 'Đăng ký tài khoản thành công.' });
      }
    );
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Lỗi mã hóa dữ liệu: ' + error.message });
  }
});

// Đăng nhập: Không phân biệt hoa thường và hỗ trợ cả Username lẫn Email
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ status: 'error', message: 'Vui lòng nhập tên tài khoản/email và mật khẩu.' });
  }

  const cleanLogin = username.trim().toLowerCase();

  db.get(
    `SELECT * FROM users WHERE LOWER(username) = ? OR LOWER(email) = ?`,
    [cleanLogin, cleanLogin],
    async (err, user) => {
      if (err) {
        return res.status(500).json({ status: 'error', message: 'Lỗi truy vấn: ' + err.message });
      }
      if (!user) {
        return res.status(400).json({ status: 'error', message: 'Tài khoản hoặc email không tồn tại.' });
      }
      if (user.is_locked === 1 || user.is_locked === true) {
        return res.status(403).json({ status: 'error', message: 'Tài khoản của bạn đã bị khóa.' });
      }

      const match = await bcrypt.compare(password, user.password);
      if (!match) {
        return res.status(400).json({ status: 'error', message: 'Mật khẩu không chính xác.' });
      }

      const tokenPayload = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      };

      const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '7d' });

      res.json({
        status: 'success',
        message: 'Đăng nhập thành công.',
        token,
        user: tokenPayload
      });
    }
  );
});

// Lấy thông tin user hiện tại
app.get('/api/auth/me', authenticateToken, (req, res) => {
  db.get(`SELECT id, username, email, role, created_at FROM users WHERE id = ?`, [req.user.id], (err, user) => {
    if (err || !user) {
      return res.status(404).json({ status: 'error', message: 'Không tìm thấy người dùng.' });
    }
    res.json({ status: 'success', user });
  });
});

// ==========================================
// 4. PUBLIC MOVIE & GENRE APIS
// ==========================================

// Danh sách thể loại
app.get('/api/genres', (req, res) => {
  db.all(`SELECT * FROM genres ORDER BY name ASC`, [], (err, rows) => {
    if (err) return res.status(500).json({ status: 'error', message: err.message });
    res.json({ status: 'success', data: rows });
  });
});

// Danh sách phim
app.get('/api/movies', (req, res) => {
  const { search, genre, featured, limit = 20, offset = 0 } = req.query;
  let conditions = [];
  let params = [];

  if (search) {
    conditions.push('m.title LIKE ?');
    params.push(`%${search.trim()}%`);
  }
  if (genre) {
    conditions.push('g.slug = ?');
    params.push(genre.trim());
  }
  if (featured !== undefined) {
    conditions.push('m.is_featured = ?');
    params.push(featured === 'true' || featured === '1' ? 1 : 0);
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT m.*, g.name as genre_name, g.slug as genre_slug
    FROM movies m
    LEFT JOIN genres g ON m.genre_id = g.id
    ${whereSql}
    ORDER BY m.id DESC
    LIMIT ? OFFSET ?
  `;

  params.push(Number(limit), Number(offset));

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ status: 'error', message: err.message });
    res.json({ status: 'success', data: rows });
  });
});

// Chi tiết 1 phim + danh sách tập
app.get('/api/movies/:id', (req, res) => {
  const movieId = req.params.id;

  const movieSql = `
    SELECT m.*, g.name as genre_name, g.slug as genre_slug
    FROM movies m
    LEFT JOIN genres g ON m.genre_id = g.id
    WHERE m.id = ? OR m.slug = ?
  `;

  db.get(movieSql, [movieId, movieId], (err, movie) => {
    if (err) return res.status(500).json({ status: 'error', message: err.message });
    if (!movie) return res.status(404).json({ status: 'error', message: 'Không tìm thấy phim.' });

    db.all(
      `SELECT id, episode_number, title, video_url FROM episodes WHERE movie_id = ? ORDER BY episode_number ASC`,
      [movie.id],
      (epErr, episodes) => {
        if (epErr) return res.status(500).json({ status: 'error', message: epErr.message });
        res.json({
          status: 'success',
          data: {
            ...movie,
            episodes: episodes || []
          }
        });
      }
    );
  });
});

// Tăng view phim
app.post('/api/movies/:id/view', (req, res) => {
  const movieId = req.params.id;
  db.run(`UPDATE movies SET views = COALESCE(views, 0) + 1 WHERE id = ?`, [movieId], function (err) {
    if (err) return res.status(500).json({ status: 'error', message: err.message });
    res.json({ status: 'success', message: 'Đã cập nhật lượt xem.' });
  });
});

// ==========================================
// 5. USER FEATURES: YÊU THÍCH & LỊCH SỬ
// ==========================================

db.run(`
  CREATE TABLE IF NOT EXISTS favorites (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    movie_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, movie_id)
  )
`, (err) => {
  if (err) console.error('❌ Lỗi tạo bảng favorites:', err.message);
  else console.log('✅ Bảng favorites đã sẵn sàng.');
});

// Lấy danh sách ID các phim đã thích
app.get('/api/user/favorites', authenticateToken, (req, res) => {
  db.all(
    'SELECT movie_id FROM favorites WHERE user_id = ?',
    [req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ status: 'error', message: err.message });
      const movieIds = rows ? rows.map(r => r.movie_id) : [];
      res.json({ status: 'success', data: movieIds });
    }
  );
});

// Thả tim / Bỏ thả tim
app.post('/api/user/favorites/:movieId', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const movieId = parseInt(req.params.movieId, 10);

  if (isNaN(movieId)) {
    return res.status(400).json({ status: 'error', message: 'ID phim không hợp lệ.' });
  }

  db.get(
    'SELECT user_id, movie_id FROM favorites WHERE user_id = ? AND movie_id = ?',
    [userId, movieId],
    (err, row) => {
      if (err) return res.status(500).json({ status: 'error', message: err.message });

      if (row) {
        db.run(
          'DELETE FROM favorites WHERE user_id = ? AND movie_id = ?',
          [userId, movieId],
          function (delErr) {
            if (delErr) return res.status(500).json({ status: 'error', message: delErr.message });
            res.json({ status: 'success', favorited: false, message: 'Đã bỏ yêu thích' });
          }
        );
      } else {
        db.run(
          'INSERT INTO favorites (user_id, movie_id) VALUES (?, ?)',
          [userId, movieId],
          function (insErr) {
            if (insErr) return res.status(500).json({ status: 'error', message: insErr.message });
            res.json({ status: 'success', favorited: true, message: 'Đã thêm vào yêu thích' });
          }
        );
      }
    }
  );
});

// Lấy danh sách chi tiết phim yêu thích
app.get('/api/favorites', authenticateToken, (req, res) => {
  const sql = `
    SELECT m.*, g.name as genre_name
    FROM favorites f
    JOIN movies m ON f.movie_id = m.id
    LEFT JOIN genres g ON m.genre_id = g.id
    WHERE f.user_id = ?
    ORDER BY f.created_at DESC
  `;
  db.all(sql, [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ status: 'error', message: err.message });
    res.json({ status: 'success', data: rows });
  });
});

// ==========================================
// 6. BÌNH LUẬN PHIM (COMMENTS)
// ==========================================

db.run(`
  CREATE TABLE IF NOT EXISTS comments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    movie_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(movie_id) REFERENCES movies(id)
  )
`, (err) => {
  if (err) console.error('❌ Lỗi tạo bảng comments:', err.message);
  else console.log('✅ Bảng comments đã sẵn sàng.');
});

// Lấy danh sách bình luận
app.get('/api/movies/:movieId/comments', (req, res) => {
  const movieId = parseInt(req.params.movieId, 10);
  const sql = `
    SELECT c.id, c.content, c.created_at, u.username
    FROM comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.movie_id = ?
    ORDER BY c.id DESC
  `;
  db.all(sql, [movieId], (err, rows) => {
    if (err) return res.status(500).json({ status: 'error', message: err.message });
    res.json({ status: 'success', data: rows || [] });
  });
});

// Gửi bình luận
app.post('/api/movies/:movieId/comments', authenticateToken, (req, res) => {
  const movieId = parseInt(req.params.movieId, 10);
  const { content } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({ status: 'error', message: 'Nội dung bình luận không được để trống.' });
  }

  const sql = `INSERT INTO comments (user_id, movie_id, content) VALUES (?, ?, ?)`;
  db.run(sql, [req.user.id, movieId, content.trim()], function (err) {
    if (err) return res.status(500).json({ status: 'error', message: err.message });

    res.status(201).json({
      status: 'success',
      message: 'Đã gửi bình luận.',
      data: {
        id: this.lastID,
        username: req.user.username,
        content: content.trim(),
        created_at: new Date().toISOString()
      }
    });
  });
});

// ==========================================
// 7. ADMIN MANAGEMENT APIS
// ==========================================

app.post('/api/admin/movies', authenticateToken, requireAdmin, (req, res) => {
  const { title, slug, description, poster_url, banner_url, release_year, genre_id, is_featured } = req.body;
  if (!title || !slug) return res.status(400).json({ status: 'error', message: 'Tiêu đề và slug là bắt buộc.' });

  const sql = `
    INSERT INTO movies (title, slug, description, poster_url, banner_url, release_year, genre_id, is_featured)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  db.run(
    sql,
    [title, slug, description || '', poster_url || '', banner_url || '', release_year || null, genre_id || null, is_featured ? 1 : 0],
    function (err) {
      if (err) return res.status(500).json({ status: 'error', message: err.message });
      res.status(201).json({ status: 'success', message: 'Thêm phim thành công.', movie_id: this.lastID });
    }
  );
});

app.put('/api/admin/movies/:id', authenticateToken, requireAdmin, (req, res) => {
  const movieId = req.params.id;
  const { title, slug, description, poster_url, banner_url, release_year, genre_id, is_featured } = req.body;

  const sql = `
    UPDATE movies 
    SET title = ?, slug = ?, description = ?, poster_url = ?, banner_url = ?, release_year = ?, genre_id = ?, is_featured = ?
    WHERE id = ?
  `;
  db.run(
    sql,
    [title, slug, description, poster_url, banner_url, release_year, genre_id, is_featured ? 1 : 0, movieId],
    function (err) {
      if (err) return res.status(500).json({ status: 'error', message: err.message });
      res.json({ status: 'success', message: 'Cập nhật phim thành công.' });
    }
  );
});

// Xóa phim: Dọn sạch bảng comments, favorites, episodes trước để không dính Foreign Key Constraint
app.delete('/api/admin/movies/:id', authenticateToken, requireAdmin, (req, res) => {
  const movieId = req.params.id;

  db.run(`DELETE FROM comments WHERE movie_id = ?`, [movieId], (err1) => {
    if (err1) return res.status(500).json({ status: 'error', message: 'Lỗi dọn dẹp bình luận: ' + err1.message });

    db.run(`DELETE FROM favorites WHERE movie_id = ?`, [movieId], (err2) => {
      if (err2) return res.status(500).json({ status: 'error', message: 'Lỗi dọn dẹp danh sách yêu thích: ' + err2.message });

      db.run(`DELETE FROM episodes WHERE movie_id = ?`, [movieId], (err3) => {
        if (err3) return res.status(500).json({ status: 'error', message: 'Lỗi dọn dẹp tập phim: ' + err3.message });

        db.run(`DELETE FROM movies WHERE id = ?`, [movieId], function (err4) {
          if (err4) return res.status(500).json({ status: 'error', message: 'Lỗi xóa phim: ' + err4.message });
          res.json({ status: 'success', message: 'Đã xóa phim và toàn bộ dữ liệu liên quan thành công!' });
        });
      });
    });
  });
});

app.post('/api/admin/episodes', authenticateToken, requireAdmin, (req, res) => {
  const { movie_id, episode_number, title, video_url } = req.body;
  if (!movie_id || !episode_number || !video_url) {
    return res.status(400).json({ status: 'error', message: 'Thiếu thông tin tập phim bắt buộc.' });
  }

  const sql = `INSERT INTO episodes (movie_id, episode_number, title, video_url) VALUES (?, ?, ?, ?)`;
  db.run(sql, [movie_id, episode_number, title || `Tập ${episode_number}`, video_url], function (err) {
    if (err) return res.status(500).json({ status: 'error', message: err.message });
    res.status(201).json({ status: 'success', message: 'Đã thêm tập phim thành công.', episode_id: this.lastID });
  });
});

app.get('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
  db.all(`SELECT id, username, email, role, is_locked, created_at FROM users ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ status: 'error', message: err.message });
    res.json({ status: 'success', data: rows });
  });
});

app.put('/api/admin/users/:id/toggle-lock', authenticateToken, requireAdmin, (req, res) => {
  const userId = req.params.id;
  db.get(`SELECT is_locked, role FROM users WHERE id = ?`, [userId], (err, user) => {
    if (err || !user) return res.status(404).json({ status: 'error', message: 'Không tìm thấy user.' });
    if (user.role === 'admin') return res.status(400).json({ status: 'error', message: 'Không thể khóa Admin.' });

    const newStatus = (user.is_locked === 1 || user.is_locked === true) ? 0 : 1;
    db.run(`UPDATE users SET is_locked = ? WHERE id = ?`, [newStatus, userId], (upErr) => {
      if (upErr) return res.status(500).json({ status: 'error', message: upErr.message });
      res.json({ status: 'success', message: newStatus === 1 ? 'Đã khóa tài khoản.' : 'Đã mở khóa tài khoản.' });
    });
  });
});

// ==========================================
// 7.5. API UPLOAD MEDIA CLOUDINARY
// ==========================================
app.post('/api/admin/upload-image', authenticateToken, requireAdmin, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ status: 'error', message: 'Vui lòng chọn file ảnh.' });
  res.json({ status: 'success', message: 'Tải ảnh thành công.', url: req.file.path });
});

app.post('/api/admin/upload-video', authenticateToken, requireAdmin, upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ status: 'error', message: 'Vui lòng chọn file video.' });
  res.json({ status: 'success', message: 'Tải video thành công.', url: req.file.path });
});

// ==========================================
// 8. KHỞI ĐỘNG SERVER
// ==========================================
app.listen(PORT, () => {
  console.log('====================================================');
  console.log(`🎬 AN MỘC NHIÊN - Movie Streaming Platform`);
  console.log(`🚀 Server đang chạy tại: http://localhost:${PORT}`);
  console.log(`🔍 Health check API:   http://localhost:${PORT}/api/health`);
  console.log('====================================================');
});