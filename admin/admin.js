let token = localStorage.getItem('admin_token') || '';

const loginSection = document.getElementById('loginSection');
const adminPanel = document.getElementById('adminPanel');
const logoutBtn = document.getElementById('logoutBtn');

// Tự động tạo slug khi gõ tiêu đề phim
document.getElementById('movieTitle').addEventListener('input', (e) => {
  const slug = e.target.value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  document.getElementById('movieSlug').value = slug;
});

// Xử lý Đăng nhập
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('adminUser').value;
  const password = document.getElementById('adminPass').value;

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
      alert(data.message);
    }
  } catch (err) {
    alert('Không thể kết nối máy chủ!');
  }
});

// Đăng xuất
logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('admin_token');
  location.reload();
});

// Khởi chạy Dashboard
async function initDashboard() {
  loginSection.style.display = 'none';
  adminPanel.style.display = 'grid';
  logoutBtn.style.display = 'inline-block';

  loadGenres();
  loadAdminMovies();
}

// Tải thể loại vào select box
async function loadGenres() {
  const res = await fetch('/api/genres');
  const json = await res.json();
  if (json.status === 'success') {
    const select = document.getElementById('movieGenre');
    select.innerHTML = json.data.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
  }
}

// Tải danh sách phim
async function loadAdminMovies() {
  const res = await fetch('/api/movies?limit=100');
  const json = await res.json();
  if (json.status === 'success') {
    const tbody = document.getElementById('movieTableBody');
    const selectEp = document.getElementById('epMovieSelect');

    tbody.innerHTML = json.data.map(m => `
      <tr>
        <td>${m.id}</td>
        <td><strong>${m.title}</strong></td>
        <td>${m.genre_name || 'Chưa gán'}</td>
        <td>${m.views || 0}</td>
        <td>
          <button class="btn-del" onclick="deleteMovie(${m.id})">Xóa</button>
        </td>
      </tr>
    `).join('');

    selectEp.innerHTML = json.data.map(m => `<option value="${m.id}">${m.title}</option>`).join('');
  }
}

// ==========================================
// HÀM DÙNG CHUNG: UPLOAD FILE LÊN CLOUDINARY
// ==========================================
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

  // Hiển thị trạng thái đang tải
  statusEl.style.display = 'block';
  statusEl.style.color = '#ff9800';
  statusEl.innerText = `⏳ Đang tải ${type === 'video' ? 'video' : 'ảnh'} lên Cloudinary... Vui lòng chờ!`;
  targetInput.disabled = true;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    const data = await res.json();

    if (data.status === 'success') {
      targetInput.value = data.url;
      statusEl.style.color = '#00e676';
      statusEl.innerText = `✅ Tải ${type === 'video' ? 'video' : 'ảnh'} lên Cloudinary thành công!`;
    } else {
      statusEl.style.color = '#ff5252';
      statusEl.innerText = `❌ Lỗi: ${data.message}`;
      alert('Lỗi tải file: ' + data.message);
    }
  } catch (error) {
    statusEl.style.color = '#ff5252';
    statusEl.innerText = '❌ Không thể kết nối tới server upload!';
    alert('Lỗi kết nối khi tải file!');
  } finally {
    targetInput.disabled = false;
  }
}

// Bắt sự kiện khi chọn file Poster
const posterFileInput = document.getElementById('posterFileInput');
if (posterFileInput) {
  posterFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    uploadToCloudinary(file, 'image', 'moviePoster', 'posterUploadStatus');
  });
}

// Bắt sự kiện khi chọn file Video tập phim
const videoFileInput = document.getElementById('videoFileInput');
if (videoFileInput) {
  videoFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    uploadToCloudinary(file, 'video', 'epVideoUrl', 'videoUploadStatus');
  });
}

// Thêm phim
document.getElementById('addMovieForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    title: document.getElementById('movieTitle').value,
    slug: document.getElementById('movieSlug').value,
    genre_id: document.getElementById('movieGenre').value,
    release_year: document.getElementById('movieYear').value,
    poster_url: document.getElementById('moviePoster').value,
    description: document.getElementById('movieDesc').value
  };

  const res = await fetch('/api/admin/movies', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  if (data.status === 'success') {
    alert('Thêm phim thành công!');
    document.getElementById('addMovieForm').reset();
    const statusPoster = document.getElementById('posterUploadStatus');
    if (statusPoster) statusPoster.style.display = 'none';
    loadAdminMovies();
  } else {
    alert(data.message);
  }
});

// Thêm tập phim
document.getElementById('addEpisodeForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    movie_id: document.getElementById('epMovieSelect').value,
    episode_number: document.getElementById('epNumber').value,
    title: document.getElementById('epTitle').value,
    video_url: document.getElementById('epVideoUrl').value
  };

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
});

// Xóa phim
async function deleteMovie(id) {
  if (!confirm('Bạn có chắc muốn xóa phim này không?')) return;

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
}

// Tự đăng nhập nếu token còn hiệu lực
if (token) {
  initDashboard();
}