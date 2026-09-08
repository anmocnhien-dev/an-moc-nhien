const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const pool = require('./db');
const { upload } = require('./cloudinary');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'anmocnhien_super_secret_key_2026';

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Phục vụ file tĩnh
app.use(express.static(path.join(__dirname, 'public')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// Khởi tạo bảng nếu chưa có
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS favorites (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        movie_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, movie_id)
      );
    `);
    console.log('✅ Bảng favorites đã sẵn sàng.');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        movie_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(movie_id) REFERENCES movies(id) ON DELETE CASCADE
      );
    `);
    console.log('✅ Bảng comments đã sẵn sàng.');
  } catch (err) {
    console.error('❌ Lỗi khởi tạo bảng:', err.message);
  }
})();

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
    await pool.query(
      `INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, 'user')`,
      [username.trim(), email.trim().toLowerCase(), hashedPassword]
    );
    res.status(201).json({ status: 'success', message: 'Đăng ký tài khoản thành công.' });
  } catch (err) {
    if (err.message && (err.message.includes('unique constraint') || err.message.includes('duplicate key'))) {
      return res.status(400).json({ status: 'error', message: 'Tên người dùng hoặc email đã tồn tại.' });
    }
    res.status(500).json({ status: 'error', message: 'Lỗi khi tạo tài khoản: ' + err.message });
  }
});

// Đăng nhập (Hỗ trợ cả Username và Email, không phân biệt hoa/thường)
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ status: 'error', message: 'Vui lòng nhập tên tài khoản/email và mật khẩu.' });
  }

  const cleanLogin = username.trim().toLowerCase();

  try {
    const { rows } = await pool.query(
      `SELECT * FROM users WHERE LOWER(username) = $1 OR LOWER(email) = $1`,
      [cleanLogin]
    );

    const user = rows[0];
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
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Lỗi truy vấn: ' + err.message });
  }
});

// Lấy thông tin user hiện tại
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT id, username, email, role, created_at FROM users WHERE id = $1`, [req.user.id]);
    if (!rows[0]) {
      return res.status(404).json({ status: 'error', message: 'Không tìm thấy người dùng.' });
    }
    res.json({ status: 'success', user: rows[0] });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ==========================================
// 4. PUBLIC MOVIE & GENRE APIS
// ==========================================

// Danh sách thể loại
app.get('/api/genres', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM genres ORDER BY name ASC`);
    res.json({ status: 'success', data: rows });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Danh sách phim
app.get('/api/movies', async (req, res) => {
  const { search, genre, featured, limit = 20, offset = 0 } = req.query;
  let conditions = [];
  let params = [];

  if (search) {
    params.push(`%${search.trim()}%`);
    conditions.push(`m.title ILIKE $${params.length}`);
  }
  if (genre) {
    params.push(genre.trim());
    conditions.push(`g.slug = $${params.length}`);
  }
  if (featured !== undefined) {
    params.push(featured === 'true' || featured === '1' ? 1 : 0);
    conditions.push(`m.is_featured = $${params.length}`);
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  params.push(Number(limit));
  const limitIdx = params.length;
  params.push(Number(offset));
  const offsetIdx = params.length;

  const sql = `
    SELECT m.*, g.name as genre_name, g.slug as genre_slug
    FROM movies m
    LEFT JOIN genres g ON m.genre_id = g.id
    ${whereSql}
    ORDER BY m.id DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  try {
    const { rows } = await pool.query(sql, params);
    res.json({ status: 'success', data: rows });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Chi tiết 1 phim + danh sách tập
app.get('/api/movies/:id', async (req, res) => {
  const movieId = req.params.id;

  const movieSql = `
    SELECT m.*, g.name as genre_name, g.slug as genre_slug
    FROM movies m
    LEFT JOIN genres g ON m.genre_id = g.id
    WHERE m.id::text = $1 OR m.slug = $1
  `;

  try {
    const { rows: movieRows } = await pool.query(movieSql, [movieId]);
    const movie = movieRows[0];
    if (!movie) return res.status(404).json({ status: 'error', message: 'Không tìm thấy phim.' });

    const { rows: episodes } = await pool.query(
      `SELECT id, episode_number, title, video_url FROM episodes WHERE movie_id = $1 ORDER BY episode_number ASC`,
      [movie.id]
    );

    res.json({
      status: 'success',
      data: {
        ...movie,
        episodes: episodes || []
      }
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Tăng view phim
app.post('/api/movies/:id/view', async (req, res) => {
  try {
    await pool.query(`UPDATE movies SET views = COALESCE(views, 0) + 1 WHERE id = $1`, [req.params.id]);
    res.json({ status: 'success', message: 'Đã cập nhật lượt xem.' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ==========================================
// 5. USER FEATURES: YÊU THÍCH & LỊCH SỬ
// ==========================================

// Lấy danh sách ID các phim người dùng đã thích
app.get('/api/user/favorites', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT movie_id FROM favorites WHERE user_id = $1', [req.user.id]);
    const movieIds = rows ? rows.map(r => r.movie_id) : [];
    res.json({ status: 'success', data: movieIds });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Bật/tắt thả tim phim
app.post('/api/user/favorites/:movieId', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const movieId = parseInt(req.params.movieId, 10);

  if (isNaN(movieId)) {
    return res.status(400).json({ status: 'error', message: 'ID phim không hợp lệ.' });
  }

  try {
    const { rows } = await pool.query('SELECT user_id, movie_id FROM favorites WHERE user_id = $1 AND movie_id = $2', [userId, movieId]);
    if (rows.length > 0) {
      await pool.query('DELETE FROM favorites WHERE user_id = $1 AND movie_id = $2', [userId, movieId]);
      res.json({ status: 'success', favorited: false, message: 'Đã bỏ yêu thích' });
    } else {
      await pool.query('INSERT INTO favorites (user_id, movie_id) VALUES ($1, $2)', [userId, movieId]);
      res.json({ status: 'success', favorited: true, message: 'Đã thêm vào yêu thích' });
    }
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Lấy danh sách đầy đủ phim yêu thích
app.get('/api/favorites', authenticateToken, async (req, res) => {
  const sql = `
    SELECT m.*, g.name as genre_name
    FROM favorites f
    JOIN movies m ON f.movie_id = m.id
    LEFT JOIN genres g ON m.genre_id = g.id
    WHERE f.user_id = $1
    ORDER BY f.created_at DESC
  `;
  try {
    const { rows } = await pool.query(sql, [req.user.id]);
    res.json({ status: 'success', data: rows });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ==========================================
// 6. BÌNH LUẬN PHIM (COMMENTS)
// ==========================================

// Lấy danh sách bình luận
app.get('/api/movies/:movieId/comments', async (req, res) => {
  const movieId = parseInt(req.params.movieId, 10);
  const sql = `
    SELECT c.id, c.content, c.created_at, u.username
    FROM comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.movie_id = $1
    ORDER BY c.id DESC
  `;
  try {
    const { rows } = await pool.query(sql, [movieId]);
    res.json({ status: 'success', data: rows || [] });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Gửi bình luận mới
app.post('/api/movies/:movieId/comments', authenticateToken, async (req, res) => {
  const movieId = parseInt(req.params.movieId, 10);
  const { content } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({ status: 'error', message: 'Nội dung bình luận không được để trống.' });
  }

  const sql = `INSERT INTO comments (user_id, movie_id, content) VALUES ($1, $2, $3) RETURNING id, created_at`;
  try {
    const { rows } = await pool.query(sql, [req.user.id, movieId, content.trim()]);
    res.status(201).json({
      status: 'success',
      message: 'Đã gửi bình luận.',
      data: {
        id: rows[0].id,
        username: req.user.username,
        content: content.trim(),
        created_at: rows[0].created_at
      }
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ==========================================
// 7. ADMIN MANAGEMENT APIS (CRUD)
// ==========================================

// Admin: Thêm phim mới
app.post('/api/admin/movies', authenticateToken, requireAdmin, async (req, res) => {
  const { title, slug, description, poster_url, banner_url, release_year, genre_id, is_featured } = req.body;

  if (!title || !slug) {
    return res.status(400).json({ status: 'error', message: 'Tiêu đề và slug là bắt buộc.' });
  }

  const sql = `
    INSERT INTO movies (title, slug, description, poster_url, banner_url, release_year, genre_id, is_featured)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id
  `;

  try {
    const { rows } = await pool.query(sql, [
      title, slug, description || '', poster_url || '', banner_url || '', release_year || null, genre_id || null, is_featured ? 1 : 0
    ]);
    res.status(201).json({ status: 'success', message: 'Thêm phim thành công.', movie_id: rows[0].id });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Admin: Sửa thông tin phim
app.put('/api/admin/movies/:id', authenticateToken, requireAdmin, async (req, res) => {
  const movieId = req.params.id;
  const { title, slug, description, poster_url, banner_url, release_year, genre_id, is_featured } = req.body;

  const sql = `
    UPDATE movies 
    SET title = $1, slug = $2, description = $3, poster_url = $4, banner_url = $5, release_year = $6, genre_id = $7, is_featured = $8
    WHERE id = $9
  `;

  try {
    await pool.query(sql, [
      title, slug, description, poster_url, banner_url, release_year, genre_id, is_featured ? 1 : 0, movieId
    ]);
    res.json({ status: 'success', message: 'Cập nhật phim thành công.' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Admin: Xóa phim
app.delete('/api/admin/movies/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await pool.query(`DELETE FROM movies WHERE id = $1`, [req.params.id]);
    res.json({ status: 'success', message: 'Đã xóa phim thành công.' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Admin: Thêm tập phim
app.post('/api/admin/episodes', authenticateToken, requireAdmin, async (req, res) => {
  const { movie_id, episode_number, title, video_url } = req.body;
  if (!movie_id || !episode_number || !video_url) {
    return res.status(400).json({ status: 'error', message: 'Thiếu thông tin tập phim bắt buộc.' });
  }

  const sql = `INSERT INTO episodes (movie_id, episode_number, title, video_url) VALUES ($1, $2, $3, $4) RETURNING id`;
  try {
    const { rows } = await pool.query(sql, [movie_id, episode_number, title || `Tập ${episode_number}`, video_url]);
    res.status(201).json({ status: 'success', message: 'Đã thêm tập phim thành công.', episode_id: rows[0].id });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Admin: Quản lý danh sách người dùng
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT id, username, email, role, is_locked, created_at FROM users ORDER BY id DESC`);
    res.json({ status: 'success', data: rows });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Admin: Khóa / Mở khóa người dùng
app.put('/api/admin/users/:id/toggle-lock', authenticateToken, requireAdmin, async (req, res) => {
  const userId = req.params.id;
  try {
    const { rows } = await pool.query(`SELECT is_locked, role FROM users WHERE id = $1`, [userId]);
    const user = rows[0];
    if (!user) return res.status(404).json({ status: 'error', message: 'Không tìm thấy user.' });
    if (user.role === 'admin') return res.status(400).json({ status: 'error', message: 'Không thể khóa Admin.' });

    const newStatus = (user.is_locked === 1 || user.is_locked === true) ? 0 : 1;
    await pool.query(`UPDATE users SET is_locked = $1 WHERE id = $2`, [newStatus, userId]);
    res.json({ status: 'success', message: newStatus === 1 ? 'Đã khóa tài khoản.' : 'Đã mở khóa tài khoản.' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ==========================================
// 7.5. API UPLOAD MEDIA LÊN CLOUDINARY
// ==========================================
app.post('/api/admin/upload-image', authenticateToken, requireAdmin, upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: 'error', message: 'Vui lòng chọn file ảnh để tải lên.' });
    }
    res.json({
      status: 'success',
      message: 'Tải ảnh lên Cloudinary thành công.',
      url: req.file.path
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.post('/api/admin/upload-video', authenticateToken, requireAdmin, upload.single('video'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: 'error', message: 'Vui lòng chọn file video để tải lên.' });
    }
    res.json({
      status: 'success',
      message: 'Tải video lên Cloudinary thành công.',
      url: req.file.path
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
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