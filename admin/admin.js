let token = localStorage.getItem('admin_token') || '';
let editingMovieId = null; // Lưu ID phim đang sửa

const loginSection = document.getElementById('loginSection');
const adminPanel = document.getElementById('adminPanel');
const logoutBtn = document.getElementById('logoutBtn');

// Xóa sạch giá trị ô đăng nhập ngay khi mở trang để chống trình duyệt tự điền sẵn
window.addEventListener('DOMContentLoaded', () => {
  const userInp = document.getElementById('adminUser');
  const passInp = document.getElementById('adminPass');
  if (userInp) userInp.value = '';
  if (passInp) passInp.value = '';
});

// Tự động tạo slug khi gõ tiêu đề phim (chỉ khi đang thêm mới)
const movieTitleInput = document.getElementById('movieTitle');
if (movieTitleInput) {
  movieTitleInput.addEventListener('input', (e) => {
    if (editingMovieId) return;
    const slug = e.target.value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[đĐ]/g, "d")
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");
    const slugEl = document.getElementById('movieSlug');
    if (slugEl) slugEl.value = slug;
  });
}

// Xử lý Đăng nhập Admin
const loginForm = document.getElementById('loginForm');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('adminUser').value.trim();
    const password = document.getElementById('adminPass').value.trim();

    if (!username || !password) {
      alert('Vui lòng nhập đầy đủ tài khoản và mật khẩu!');
      return;
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (data.status === 'success') {
        if (data.user.role !== 'admin') {
          alert('Tài khoản không có quyền Admin!');
          return;
        }
        token = data.token;
        localStorage.setItem('admin_token', token);
        initDashboard();
      } else {
        alert(data.message || 'Tài khoản hoặc mật khẩu không chính xác!');
      }
    } catch (err) {
      alert('Không thể kết nối máy chủ!');
    }
  });
}

// Đăng xuất Admin
if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('admin_token');
    location.reload();
  });
}

// Khởi chạy Dashboard
async function initDashboard() {
  if (loginSection) loginSection.style.display = 'none';
  if (adminPanel) adminPanel.style.display = 'grid';
  if (logoutBtn) logoutBtn.style.display = 'inline-block';

  await loadGenres();
  await loadAdminMovies();
}

// Tải thể loại vào select box
async function loadGenres() {
  try {
    const res = await fetch('/api/genres');
    const json = await res.json();
    if (json.status === 'success') {
      const select = document.getElementById('movieGenre');
      if (select) {
        select.innerHTML = json.data.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
      }
    }
  } catch (err) {
    console.error('Lỗi tải thể loại:', err);
  }
}

// Tải danh sách phim (kèm nút Sửa và Xóa)
async function loadAdminMovies() {
  try {
    const res = await fetch('/api/movies?limit=100');
    const json = await res.json();
    if (json.status === 'success') {
      const tbody = document.getElementById('movieTableBody');
      const selectEp = document.getElementById('epMovieSelect');

      if (tbody) {
        tbody.innerHTML = json.data.map(m => `
          <tr>
            <td>${m.id}</td>
            <td><strong>${m.title}</strong></td>
            <td>${m.genre_name || 'Chưa gán'}</td>
            <td>${m.views || 0}</td>
            <td>
              <button style="background: #2563eb; color: #fff; border: none; padding: 5px 12px; border-radius: 4px; cursor: pointer; margin-right: 6px; font-weight: 500;" onclick='startEditMovie(${JSON.stringify(m).replace(/'/g, "&apos;")})'>Sửa</button>
              <button class="btn-del" style="background: #dc2626; color: #fff; border: none; padding: 5px 12px; border-radius: 4px; cursor: pointer; font-weight: 500;" onclick="deleteMovie(${m.id})">Xóa</button>
            </td>
          </tr>
        `).join('');
      }

      if (selectEp) {
        selectEp.innerHTML = json.data.map(m => `<option value="${m.id}">${m.title}</option>`).join('');
      }
    }
  } catch (err) {
    console.error('Lỗi tải danh sách phim admin:', err);
  }
}

// Chế độ SỬA PHIM
window.startEditMovie = function(movie) {
  editingMovieId = movie.id;

  document.getElementById('movieTitle').value = movie.title || '';
  document.getElementById('movieSlug').value = movie.slug || '';
  document.getElementById('movieYear').value = movie.release_year || 2026;
  document.getElementById('moviePoster').value = movie.poster_url || '';
  document.getElementById('movieDesc').value = movie.description || '';

  if (movie.genre_id) {
    document.getElementById('movieGenre').value = movie.genre_id;
  }

  const addForm = document.getElementById('addMovieForm');
  if (addForm) {
    const formCard = addForm.parentElement;
    const titleHeading = formCard.querySelector('h3');
    if (titleHeading) titleHeading.textContent = `✏️ Sửa Phim: ${movie.title}`;

    const submitBtn = addForm.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.textContent = 'Cập Nhật Thay Đổi';
      submitBtn.style.background = '#2563eb';

      if (!document.getElementById('cancelEditBtn')) {
        const cancelBtn = document.createElement('button');
        cancelBtn.id = 'cancelEditBtn';
        cancelBtn.type = 'button';
        cancelBtn.textContent = 'Hủy Bỏ';
        cancelBtn.style.cssText = 'margin-left: 10px; background: #4b5563; color: #fff; border: none; padding: 8px 14px; border-radius: 4px; cursor: pointer;';
        cancelBtn.onclick = resetMovieForm;
        submitBtn.parentNode.appendChild(cancelBtn);
      }
    }
    formCard.scrollIntoView({ behavior: 'smooth' });
  }
};

// Reset form về trạng thái thêm mới
function resetMovieForm() {
  editingMovieId = null;
  const form = document.getElementById('addMovieForm');
  if (form) {
    form.reset();
    const titleHeading = form.parentElement.querySelector('h3');
    if (titleHeading) titleHeading.textContent = '➕ Thêm Phim Mới';

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.textContent = 'Lưu Phim';
      submitBtn.style.background = '';
    }
  }

  const cancelBtn = document.getElementById('cancelEditBtn');
  if (cancelBtn) cancelBtn.remove();

  const statusPoster = document.getElementById('posterUploadStatus');
  if (statusPoster) statusPoster.style.display = 'none';
}

// Upload Cloudinary
async function uploadToCloudinary(file, type, targetInputId, statusElementId) {
  if (!file) return;

  if (!token) {
    alert('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại!');
    return;
  }

  const endpoint = type === 'video' ? '/api/admin/upload-video' : '/api/admin/upload-image';
  const fieldName = type === 'video' ? 'video' : 'image';

  const formData = new FormData();
  formData.append(fieldName, file);

  const targetInput = document.getElementById(targetInputId);
  const statusEl = document.getElementById(statusElementId);

  if (statusEl) {
    statusEl.style.display = 'block';
    statusEl.style.color = '#ff9800';
    statusEl.innerText = `⏳ Đang tải ${type === 'video' ? 'video' : 'ảnh'} lên... Vui lòng chờ!`;
  }
  if (targetInput) targetInput.disabled = true;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });

    const data = await res.json();

    if (data.status === 'success') {
      if (targetInput) targetInput.value = data.url;
      if (statusEl) {
        statusEl.style.color = '#00e676';
        statusEl.innerText = `✅ Tải ${type === 'video' ? 'video' : 'ảnh'} thành công!`;
      }
    } else {
      if (statusEl) {
        statusEl.style.color = '#ff5252';
        statusEl.innerText = `❌ Lỗi: ${data.message}`;
      }
      alert('Lỗi tải file: ' + data.message);
    }
  } catch (error) {
    if (statusEl) {
      statusEl.style.color = '#ff5252';
      statusEl.innerText = '❌ Không thể kết nối tới server upload!';
    }
    alert('Lỗi kết nối khi tải file!');
  } finally {
    if (targetInput) targetInput.disabled = false;
  }
}

// Bắt sự kiện Poster
const posterFileInput = document.getElementById('posterFileInput');
if (posterFileInput) {
  posterFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    uploadToCloudinary(file, 'image', 'moviePoster', 'posterUploadStatus');
  });
}

// Bắt sự kiện Video
const videoFileInput = document.getElementById('videoFileInput');
if (videoFileInput) {
  videoFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    uploadToCloudinary(file, 'video', 'epVideoUrl', 'videoUploadStatus');
  });
}

// Thêm mới hoặc Sửa phim
const addMovieForm = document.getElementById('addMovieForm');
if (addMovieForm) {
  addMovieForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      title: document.getElementById('movieTitle').value,
      slug: document.getElementById('movieSlug').value,
      genre_id: document.getElementById('movieGenre').value,
      release_year: document.getElementById('movieYear').value,
      poster_url: document.getElementById('moviePoster').value,
      description: document.getElementById('movieDesc').value
    };

    const url = editingMovieId ? `/api/admin/movies/${editingMovieId}` : '/api/admin/movies';
    const method = editingMovieId ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (data.status === 'success') {
        alert(editingMovieId ? 'Cập nhật phim thành công!' : 'Thêm phim thành công!');
        resetMovieForm();
        loadAdminMovies();
      } else {
        alert(data.message || 'Thao tác không thành công.');
      }
    } catch (err) {
      alert('Lỗi kết nối máy chủ!');
    }
  });
}

// Thêm tập phim
const addEpisodeForm = document.getElementById('addEpisodeForm');
if (addEpisodeForm) {
  addEpisodeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      movie_id: document.getElementById('epMovieSelect').value,
      episode_number: document.getElementById('epNumber').value,
      title: document.getElementById('epTitle').value,
      video_url: document.getElementById('epVideoUrl').value
    };

    try {
      const res = await fetch('/api/admin/episodes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (data.status === 'success') {
        alert('Đã thêm tập phim thành công!');
        document.getElementById('epTitle').value = '';
        document.getElementById('epVideoUrl').value = '';
        const videoInput = document.getElementById('videoFileInput');
        if (videoInput) videoInput.value = '';
        const statusVideo = document.getElementById('videoUploadStatus');
        if (statusVideo) statusVideo.style.display = 'none';
        document.getElementById('epNumber').value = Number(body.episode_number) + 1;
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert('Lỗi kết nối máy chủ khi thêm tập!');
    }
  });
}

// Xóa phim
async function deleteMovie(id) {
  if (!confirm('Bạn có chắc muốn xóa bộ phim này và các tập liên quan không?')) return;

  try {
    const res = await fetch(`/api/admin/movies/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await res.json();
    if (data.status === 'success') {
      loadAdminMovies();
    } else {
      alert(data.message);
    }
  } catch (err) {
    alert('Lỗi khi xóa phim!');
  }
}

// Tự đăng nhập nếu đã có token
if (token) {
  initDashboard();
}