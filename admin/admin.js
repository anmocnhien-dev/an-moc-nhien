<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Dashboard - AN MỘC NHIÊN</title>
  <link rel="stylesheet" href="admin.css">
</head>
<body>

  <div class="header">
    <h1>🎬 Quản Trị Hệ Thống - AN MỘC NHIÊN</h1>
    <div>
      <a href="/" target="_blank">Xem Trang Chủ ↗</a>
      <button id="logoutBtn" style="display:none; margin-left:15px; background:transparent; border:1px solid #444; color:#fff; padding:5px 10px; border-radius:4px; cursor:pointer;">Đăng Xuất</button>
    </div>
  </div>

  <!-- Form Đăng Nhập Quản Trị (Trống hoàn toàn - Chống Autofill) -->
  <div id="loginSection" class="login-box">
    <h2>Đăng Nhập Quản Trị</h2>
    <form id="loginForm" autocomplete="off">
      <div class="form-group">
        <label>Tài khoản</label>
        <input 
          type="text" 
          id="adminUser" 
          placeholder="Nhập tài khoản quản trị..." 
          autocomplete="off" 
          value="" 
          required>
      </div>
      <div class="form-group">
        <label>Mật khẩu</label>
        <input 
          type="password" 
          id="adminPass" 
          placeholder="Nhập mật khẩu..." 
          autocomplete="new-password" 
          value="" 
          required>
      </div>
      <button type="submit" class="btn-submit">Đăng Nhập</button>
    </form>
  </div>

  <!-- Bảng Quản Trị Phim -->
  <div id="adminPanel" class="dashboard" style="display: none;">
    
    <!-- Cột trái: Form Thêm Phim & Tập -->
    <div>
      <div class="card">
        <h3>➕ Thêm Phim Mới</h3>
        <form id="addMovieForm">
          <div class="form-group">
            <label>Tên phim</label>
            <input type="text" id="movieTitle" required placeholder="Ví dụ: Tây Du Ký">
          </div>
          <div class="form-group">
            <label>Slug (Đường dẫn tĩnh)</label>
            <input type="text" id="movieSlug" required placeholder="vi-du: tay-du-ky">
          </div>
          <div class="form-group">
            <label>Thể loại</label>
            <select id="movieGenre"></select>
          </div>
          <div class="form-group">
            <label>Năm phát hành</label>
            <input type="number" id="movieYear" value="2026">
          </div>
          
          <!-- Upload ảnh bìa Poster -->
          <div class="form-group">
            <label>Ảnh bìa Poster</label>
            <input type="file" id="posterFileInput" accept="image/*" style="margin-bottom: 6px;">
            <input type="text" id="moviePoster" placeholder="Link ảnh hoặc tải file ở trên...">
            <small id="posterUploadStatus" style="display:none; color:#00e676; font-size:12px;"></small>
          </div>

          <div class="form-group">
            <label>Mô tả ngắn</label>
            <textarea id="movieDesc" rows="3"></textarea>
          </div>
          <button type="submit" class="btn-submit">Lưu Phim</button>
        </form>
      </div>

      <div class="card">
        <h3>🎬 Thêm Tập Phim</h3>
        <form id="addEpisodeForm">
          <div class="form-group">
            <label>Chọn Phim</label>
            <select id="epMovieSelect" required></select>
          </div>
          <div class="form-group">
            <label>Tập số</label>
            <input type="number" id="epNumber" value="1" required>
          </div>
          <div class="form-group">
            <label>Tiêu đề tập</label>
            <input type="text" id="epTitle" placeholder="Tập 1">
          </div>

          <!-- Upload file Video tập phim -->
          <div class="form-group">
            <label>Video tập phim</label>
            <input type="file" id="videoFileInput" accept="video/mp4,video/mkv,video/*" style="margin-bottom: 6px;">
            <input type="text" id="epVideoUrl" required placeholder="Dán link hoặc chọn tệp video ở trên...">
            <small id="videoUploadStatus" style="display:none; color:#00e676; font-size:12px;"></small>
          </div>

          <button type="submit" class="btn-submit">Thêm Tập</button>
        </form>
      </div>
    </div>

    <!-- Cột phải: Danh Sách Phim Hiện Có -->
    <div>
      <div class="card">
        <h3>📋 Danh Sách Phim</h3>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Tên Phim</th>
              <th>Thể loại</th>
              <th>Lượt xem</th>
              <th>Hành động</th>
            </tr>
          </thead>
          <tbody id="movieTableBody"></tbody>
        </table>
      </div>
    </div>

  </div>

  <script src="admin.js?v=3.0"></script>
</body>
</html>