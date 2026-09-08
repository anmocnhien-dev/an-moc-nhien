let currentMovies = [];
let activeGenre = '';
let userToken = localStorage.getItem('user_token') || '';
let currentUser = JSON.parse(localStorage.getItem('user_info') || 'null');
let favoriteMovieIds = [];
let currentOpeningMovieId = null;

// Biến lưu danh sách tập và vị trí tập đang phát
let currentMovieEpisodes = [];
let currentEpisodeIndex = 0;
let isSwitchingEpisode = false;

// ==========================================
// 1. TẢI THỂ LOẠI & DANH SÁCH PHIM
// ==========================================
async function loadGenres() {
  try {
    const res = await fetch('/api/genres');
    const json = await res.json();
    const genreFilter = document.getElementById('genreFilter');
    const btnMyFavorites = document.getElementById('btnMyFavorites');

    // Sự kiện nút Phim Yêu Thích
    if (btnMyFavorites) {
      btnMyFavorites.addEventListener('click', async () => {
        if (!userToken) {
          alert('Vui lòng đăng nhập để xem danh sách yêu thích của bạn!');
          document.getElementById('authModal').style.display = 'block';
          return;
        }

        document.querySelectorAll('.genre-tag').forEach(el => el.classList.remove('active'));
        btnMyFavorites.classList.add('active');
        activeGenre = '';

        await loadUserFavorites();

        const favMovies = currentMovies.filter(m => favoriteMovieIds.includes(m.id));
        renderMovieList(favMovies, '❤️ Danh Sách Phim Yêu Thích');
      });
    }

    // Sự kiện nút Tất cả
    const allTag = genreFilter ? genreFilter.querySelector('.genre-tag[data-slug=""]') : null;
    if (allTag) {
      allTag.addEventListener('click', () => {
        document.querySelectorAll('.genre-tag').forEach(el => el.classList.remove('active'));
        allTag.classList.add('active');
        activeGenre = '';
        loadMovies();
      });
    }

    // Thêm các tag thể loại động từ API
    if (json.status === 'success' && genreFilter) {
      json.data.forEach(g => {
        const tag = document.createElement('div');
        tag.className = 'genre-tag';
        tag.dataset.slug = g.slug;
        tag.textContent = g.name;
        tag.addEventListener('click', () => {
          document.querySelectorAll('.genre-tag').forEach(el => el.classList.remove('active'));
          tag.classList.add('active');
          activeGenre = g.slug;
          loadMovies();
        });
        genreFilter.appendChild(tag);
      });
    }
  } catch (err) {
    console.error('Lỗi tải thể loại:', err);
  }
}

// Render danh sách thẻ phim
function renderMovieList(movies, titleText = 'Phim Mới Cập Nhật') {
  const movieGrid = document.getElementById('movieGrid');
  const titleEl = document.getElementById('listTitle');
  if (titleEl) titleEl.textContent = titleText;

  if (movies && movies.length > 0) {
    movieGrid.innerHTML = movies.map(movie => {
      const isFav = favoriteMovieIds.includes(movie.id);
      return `
        <div class="movie-card" onclick="openMovie(${movie.id})">
          <button class="fav-btn ${isFav ? 'active' : ''}" onclick="toggleFavorite(event, ${movie.id})">
            ${isFav ? '❤️' : '🤍'}
          </button>
          <img src="${movie.poster_url || 'https://via.placeholder.com/300x450?text=No+Poster'}" alt="${movie.title}">
          <div class="movie-info">
            <div class="movie-title">${movie.title}</div>
            <div class="movie-meta">
              <span>${movie.genre_name || 'Khác'}</span>
              <span>👁️ ${movie.views || 0}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  } else {
    movieGrid.innerHTML = '<p style="color: #9ca3af;">Hiện chưa có bộ phim nào trong danh mục này.</p>';
  }
}

async function loadMovies(searchTerm = '') {
  const movieGrid = document.getElementById('movieGrid');
  movieGrid.innerHTML = '<p style="color: #9ca3af;">Đang tải danh sách phim...</p>';

  try {
    let url = `/api/movies?limit=50`;
    if (activeGenre) url += `&genre=${encodeURIComponent(activeGenre)}`;
    if (searchTerm) url += `&search=${encodeURIComponent(searchTerm)}`;

    const res = await fetch(url);
    const json = await res.json();

    if (json.status === 'success') {
      currentMovies = json.data;
      renderMovieList(currentMovies, searchTerm ? `Kết quả tìm kiếm cho: "${searchTerm}"` : 'Phim Mới Cập Nhật');
    } else {
      movieGrid.innerHTML = '<p style="color: #9ca3af;">Hiện chưa có phim nào trong mục này.</p>';
    }
  } catch (err) {
    movieGrid.innerHTML = '<p style="color: red;">Lỗi khi tải dữ liệu phim.</p>';
  }
}

// ==========================================
// 2. PHÁT PHIM, CHỌN TẬP & ĐIỀU HƯỚNG TẬP
// ==========================================

// Hàm chuyển tập tiếp theo an toàn
function playNextEpisode() {
  if (isSwitchingEpisode) return;
  if (currentEpisodeIndex + 1 < currentMovieEpisodes.length) {
    isSwitchingEpisode = true;
    currentEpisodeIndex++;
    const nextEpisode = currentMovieEpisodes[currentEpisodeIndex];
    const allBtns = document.querySelectorAll('.episode-btn');
    
    playEpisode(nextEpisode.video_url, allBtns[currentEpisodeIndex], currentEpisodeIndex);
    
    setTimeout(() => {
      isSwitchingEpisode = false;
    }, 1200);
  } else {
    alert('Bạn đang xem tập mới nhất của bộ phim này rồi!');
  }
}

function setVideoSource(url) {
  let player = document.getElementById('videoPlayer');
  if (!player) return;

  if (!url) {
    if (player.tagName.toLowerCase() === 'video') {
      player.pause();
      player.src = '';
    } else {
      player.src = '';
    }
    return;
  }

  // Nếu là Google Drive
  if (url.includes('drive.google.com')) {
    let embedUrl = url;
    if (url.includes('/file/d/')) {
      const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        embedUrl = `https://drive.google.com/file/d/${match[1]}/preview`;
      }
    } else if (url.includes('id=')) {
      const match = url.match(/id=([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        embedUrl = `https://drive.google.com/file/d/${match[1]}/preview`;
      }
    }

    if (player.tagName.toLowerCase() !== 'iframe') {
      const iframe = document.createElement('iframe');
      iframe.id = 'videoPlayer';
      iframe.style.width = '100%';
      iframe.style.aspectRatio = '16/9';
      iframe.style.border = 'none';
      iframe.allow = 'autoplay; fullscreen';
      iframe.allowFullscreen = true;
      player.parentNode.replaceChild(iframe, player);
      player = iframe;
    }
    player.src = embedUrl;
  } else {
    // Nếu là file video MP4 / Cloudinary
    if (player.tagName.toLowerCase() !== 'video') {
      const video = document.createElement('video');
      video.id = 'videoPlayer';
      video.controls = true;
      video.autoplay = true;
      video.style.width = '100%';
      video.style.aspectRatio = '16/9';
      player.parentNode.replaceChild(video, player);
      player = video;
    }

    player.onended = null;
    player.ontimeupdate = null;

    player.src = url;

    player.onended = () => {
      playNextEpisode();
    };

    player.ontimeupdate = () => {
      if (player.duration && player.currentTime > 0) {
        if (player.duration - player.currentTime <= 0.3) {
          playNextEpisode();
        }
      }
    };

    player.play().catch(err => {
      console.warn('Trình duyệt chặn autoplay:', err);
    });
  }
}

async function openMovie(movieId) {
  try {
    const res = await fetch(`/api/movies/${movieId}`);
    const json = await res.json();

    if (json.status === 'success') {
      const movie = json.data;
      currentOpeningMovieId = movie.id;
      currentMovieEpisodes = movie.episodes || [];
      currentEpisodeIndex = 0;
      isSwitchingEpisode = false;

      document.getElementById('modalMovieTitle').textContent = movie.title;
      document.getElementById('modalMovieDesc').textContent = movie.description || 'Chưa có mô tả.';

      const episodeList = document.getElementById('episodeList');

      if (currentMovieEpisodes.length > 0) {
        // Nút Tập Tiếp Theo hiển thị nếu phim có từ 2 tập trở lên
        const quickNextBtnHtml = currentMovieEpisodes.length > 1
          ? `<div style="margin-bottom: 12px;"><button type="button" onclick="playNextEpisode()" style="background: #2563eb; color: #ffffff; border: none; padding: 7px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-size: 0.9rem; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">Tập Tiếp Theo ▶</button></div>`
          : '';

        episodeList.innerHTML = quickNextBtnHtml + currentMovieEpisodes.map((ep, idx) => `
          <button class="episode-btn ${idx === 0 ? 'active' : ''}" onclick="playEpisode('${ep.video_url}', this, ${idx})">
            ${ep.title || 'Tập ' + ep.episode_number}
          </button>
        `).join('');

        setVideoSource(currentMovieEpisodes[0].video_url);
      } else {
        episodeList.innerHTML = '<p style="color: #9ca3af;">Phim chưa cập nhật tập nào.</p>';
        setVideoSource('');
      }

      // Tăng lượt xem
      fetch(`/api/movies/${movieId}/view`, { method: 'POST' });

      // Tải bình luận
      loadMovieComments(movieId);

      document.getElementById('playerModal').style.display = 'block';
    }
  } catch (err) {
    alert('Không thể mở thông tin phim này.');
  }
}

function playEpisode(url, btn, idx) {
  if (typeof idx === 'number') {
    currentEpisodeIndex = idx;
  }
  setVideoSource(url);
  document.querySelectorAll('.episode-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

document.getElementById('closeModal').addEventListener('click', () => {
  const modal = document.getElementById('playerModal');
  setVideoSource(''); // Dừng phát hoàn toàn
  modal.style.display = 'none';
  currentOpeningMovieId = null;
  currentMovieEpisodes = [];
  currentEpisodeIndex = 0;
  isSwitchingEpisode = false;
});

document.getElementById('searchBtn').addEventListener('click', () => {
  const query = document.getElementById('searchInput').value.trim();
  loadMovies(query);
});

// ==========================================
// 3. TÍNH NĂNG PHIM YÊU THÍCH (FAVORITES)
// ==========================================
async function loadUserFavorites() {
  if (!userToken) {
    favoriteMovieIds = [];
    return;
  }
  try {
    const res = await fetch('/api/user/favorites', {
      headers: {
        'Authorization': `Bearer ${userToken}`
      }
    });

    if (res.status === 401 || res.status === 403) {
      logoutUser();
      return;
    }

    const json = await res.json();
    if (json.status === 'success') {
      favoriteMovieIds = json.data;
    }
  } catch (err) {
    console.error('Lỗi tải danh sách yêu thích:', err);
  }
}

async function toggleFavorite(e, movieId) {
  if (e) e.stopPropagation();

  const btn = e ? (e.currentTarget || (e.target && e.target.closest ? e.target.closest('.fav-btn') : e.target)) : null;

  if (!userToken) {
    alert('Vui lòng đăng nhập để lưu phim yêu thích!');
    document.getElementById('authModal').style.display = 'block';
    return;
  }

  try {
    const res = await fetch(`/api/user/favorites/${movieId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      }
    });

    if (res.status === 401 || res.status === 403) {
      alert('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại!');
      logoutUser();
      return;
    }

    const json = await res.json();

    if (json.status === 'success') {
      if (json.favorited) {
        if (btn) {
          btn.classList.add('active');
          btn.innerHTML = '❤️';
        }
        if (!favoriteMovieIds.includes(movieId)) favoriteMovieIds.push(movieId);
      } else {
        if (btn) {
          btn.classList.remove('active');
          btn.innerHTML = '🤍';
        }
        favoriteMovieIds = favoriteMovieIds.filter(id => id !== movieId);

        const btnMyFavorites = document.getElementById('btnMyFavorites');
        if (btnMyFavorites && btnMyFavorites.classList.contains('active')) {
          const favMovies = currentMovies.filter(m => favoriteMovieIds.includes(m.id));
          renderMovieList(favMovies, '❤️ Danh Sách Phim Yêu Thích');
        }
      }
    } else {
      alert(json.message || 'Thao tác không thành công.');
    }
  } catch (err) {
    console.error('Lỗi khi thao tác thả tim:', err);
    alert('Lỗi: ' + err.message);
  }
}

// ==========================================
// 4. TÍNH NĂNG BÌNH LUẬN (COMMENTS)
// ==========================================
async function loadMovieComments(movieId) {
  const commentList = document.getElementById('commentList');
  const commentCount = document.getElementById('commentCount');
  const formBox = document.getElementById('commentFormContainer');
  const noticeBox = document.getElementById('commentLoginNotice');

  if (!commentList) return;

  if (userToken) {
    if (formBox) formBox.style.display = 'block';
    if (noticeBox) noticeBox.style.display = 'none';
  } else {
    if (formBox) formBox.style.display = 'none';
    if (noticeBox) noticeBox.style.display = 'block';
  }

  commentList.innerHTML = '<p style="color: #9ca3af; font-size: 0.9rem;">Đang tải bình luận...</p>';

  try {
    const res = await fetch(`/api/movies/${movieId}/comments`);
    const json = await res.json();

    if (json.status === 'success') {
      const list = json.data || [];
      if (commentCount) commentCount.textContent = list.length;

      if (list.length === 0) {
        commentList.innerHTML = '<p style="color: #9ca3af; font-size: 0.9rem;">Chưa có bình luận nào. Hãy là người đầu tiên để lại ý kiến!</p>';
        return;
      }

      commentList.innerHTML = list.map(c => `
        <div style="background: #18181b; padding: 10px 14px; border-radius: 8px; border: 1px solid #27272a;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
            <span style="font-weight: bold; color: #60a5fa; font-size: 0.92rem;">👤 ${c.username}</span>
            <span style="color: #71717a; font-size: 0.78rem;">${new Date(c.created_at).toLocaleDateString('vi-VN')}</span>
          </div>
          <div style="color: #e4e4e7; font-size: 0.93rem; line-height: 1.4; word-break: break-word;">${c.content}</div>
        </div>
      `).join('');
    } else {
      commentList.innerHTML = '<p style="color: #ef4444; font-size: 0.9rem;">Không thể tải bình luận.</p>';
    }
  } catch (err) {
    console.error('Lỗi khi tải bình luận:', err);
    commentList.innerHTML = '<p style="color: #ef4444; font-size: 0.9rem;">Lỗi kết nối máy chủ khi lấy bình luận.</p>';
  }
}

async function sendUserComment() {
  const input = document.getElementById('commentInput');
  if (!input) return;

  const content = input.value.trim();

  if (!content) {
    alert('Vui lòng nhập nội dung bình luận!');
    return;
  }

  if (!userToken) {
    alert('Vui lòng đăng nhập để bình luận!');
    document.getElementById('authModal').style.display = 'block';
    return;
  }

  if (!currentOpeningMovieId) {
    alert('Không xác định được phim hiện tại.');
    return;
  }

  try {
    const res = await fetch(`/api/movies/${currentOpeningMovieId}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({ content })
    });

    const json = await res.json();

    if (json.status === 'success') {
      input.value = '';
      loadMovieComments(currentOpeningMovieId);
    } else {
      alert(json.message || 'Không thể gửi bình luận.');
    }
  } catch (err) {
    console.error('Lỗi gửi bình luận:', err);
    alert('Lỗi kết nối khi gửi bình luận.');
  }
}

// ==========================================
// 5. QUẢN LÝ TÀI KHOẢN & MODAL AUTH
// ==========================================
const authModal = document.getElementById('authModal');
const closeAuthModal = document.getElementById('closeAuthModal');

function bindAuthButton() {
  const loginBtn = document.getElementById('loginBtn');
  if (loginBtn) {
    loginBtn.addEventListener('click', () => {
      authModal.style.display = 'block';
    });
  }
}

if (closeAuthModal) {
  closeAuthModal.addEventListener('click', () => {
    authModal.style.display = 'none';
  });
}

window.addEventListener('click', (e) => {
  if (e.target === authModal) authModal.style.display = 'none';
});

function switchAuthTab(type) {
  const isLogin = type === 'login';
  document.getElementById('tabLogin').classList.toggle('active', isLogin);
  document.getElementById('tabRegister').classList.toggle('active', !isLogin);
  document.getElementById('userLoginForm').style.display = isLogin ? 'block' : 'none';
  document.getElementById('userRegisterForm').style.display = isLogin ? 'none' : 'block';
}

document.getElementById('userRegisterForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('regUsername').value;
  const email = document.getElementById('regEmail').value;
  const password = document.getElementById('regPassword').value;

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });
    const data = await res.json();

    if (data.status === 'success') {
      alert('Đăng ký thành công! Vui lòng đăng nhập.');
      switchAuthTab('login');
      document.getElementById('loginUsername').value = username;
    } else {
      alert(data.message);
    }
  } catch (err) {
    alert('Không thể kết nối đến máy chủ.');
  }
});

document.getElementById('userLoginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value;
  const password = document.getElementById('loginPassword').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (data.status === 'success') {
      localStorage.setItem('user_token', data.token);
      localStorage.setItem('user_info', JSON.stringify(data.user));
      userToken = data.token;
      currentUser = data.user;
      authModal.style.display = 'none';
      renderUserNav();
      await loadUserFavorites();
      loadMovies();

      if (currentOpeningMovieId) {
        loadMovieComments(currentOpeningMovieId);
      }
    } else {
      alert(data.message);
    }
  } catch (err) {
    alert('Không thể kết nối đến máy chủ.');
  }
});

function renderUserNav() {
  const authNav = document.getElementById('authNav');
  if (currentUser && userToken) {
    authNav.innerHTML = `
      <div class="user-badge">
        <span>Xin chào, <strong>${currentUser.username}</strong></span>
        ${currentUser.role === 'admin' ? '<a href="/admin" target="_blank"><button>Admin</button></a>' : ''}
        <button onclick="logoutUser()">Đăng Xuất</button>
      </div>
    `;
  } else {
    authNav.innerHTML = `
      <button id="loginBtn" class="btn-primary">Đăng Nhập</button>
      <a href="/admin" style="text-decoration: none;"><button>Trang Quản Trị</button></a>
    `;
    bindAuthButton();
  }
}

function logoutUser() {
  localStorage.removeItem('user_token');
  localStorage.removeItem('user_info');
  location.reload();
}

// Khởi chạy khi load trang
window.addEventListener('DOMContentLoaded', async () => {
  await loadUserFavorites();
  loadGenres();
  loadMovies();
  renderUserNav();

  const sendCommentBtn = document.getElementById('sendCommentBtn');
  const commentInput = document.getElementById('commentInput');

  if (sendCommentBtn) {
    sendCommentBtn.addEventListener('click', sendUserComment);
  }

  if (commentInput) {
    commentInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        sendUserComment();
      }
    });
  }
});