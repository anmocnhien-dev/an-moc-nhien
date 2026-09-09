let currentMovies = [];
let activeGenre = '';
let userToken = localStorage.getItem('user_token') || '';

// Chống crash cú pháp JSON.parse nếu dữ liệu user bị lỗi/undefined
let currentUser = null;
try {
  const storedUser = localStorage.getItem('user_info');
  if (storedUser && storedUser !== 'undefined' && storedUser !== 'null') {
    currentUser = JSON.parse(storedUser);
  }
} catch (e) {
  console.warn('Lỗi đọc user_info từ cache:', e);
  currentUser = null;
}

let favoriteMovieIds = [];
let currentOpeningMovieId = null;

// Biến lưu danh sách tập và vị trí tập đang phát
let currentMovieEpisodes = [];
let currentEpisodeIndex = 0;
let isSwitchingEpisode = false;

// Biến lưu URL video và instance trình phát
window.currentPlayingUrl = '';
let currentPlyrInstance = null;
let ytNativePlayer = null;
let ytSyncInterval = null;

// Nạp tự động YouTube IFrame API nếu chưa có
if (!window.YT) {
  const tag = document.createElement('script');
  tag.src = "https://www.youtube.com/iframe_api";
  const firstScriptTag = document.getElementsByTagName('script')[0];
  firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
}

// ==========================================
// 1. TẢI THỂ LOẠI & DANH SÁCH PHIM
// ==========================================
async function loadGenres() {
  try {
    const genreFilter = document.getElementById('genreFilter');
    const btnMyFavorites = document.getElementById('btnMyFavorites');

    if (btnMyFavorites && !btnMyFavorites.dataset.bound) {
      btnMyFavorites.dataset.bound = 'true';
      btnMyFavorites.addEventListener('click', async () => {
        if (!userToken) {
          alert('Vui lòng đăng nhập để xem danh sách yêu thích của bạn!');
          const authModal = document.getElementById('authModal');
          if (authModal) authModal.style.display = 'block';
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

    const allTag = genreFilter ? genreFilter.querySelector('.genre-tag[data-slug=""]') : null;
    if (allTag && !allTag.dataset.bound) {
      allTag.dataset.bound = 'true';
      allTag.addEventListener('click', () => {
        document.querySelectorAll('.genre-tag').forEach(el => el.classList.remove('active'));
        allTag.classList.add('active');
        activeGenre = '';
        loadMovies();
      });
    }

    const res = await fetch('/api/genres');
    const json = await res.json();

    if (json.status === 'success' && genreFilter && Array.isArray(json.data)) {
      const oldTags = genreFilter.querySelectorAll('.genre-tag-dynamic');
      oldTags.forEach(t => t.remove());

      json.data.forEach(g => {
        const tag = document.createElement('div');
        tag.className = 'genre-tag genre-tag-dynamic';
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

function renderMovieList(movies, titleText = 'Phim Mới Cập Nhật') {
  const movieGrid = document.getElementById('movieGrid');
  const titleEl = document.getElementById('listTitle');
  if (titleEl) titleEl.textContent = titleText;
  if (!movieGrid) return;

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
    movieGrid.innerHTML = '<p style="color: #9ca3af; padding: 20px 0;">Hiện chưa có bộ phim nào trong danh mục này.</p>';
  }
}

async function loadMovies(searchTerm = '') {
  const movieGrid = document.getElementById('movieGrid');
  if (movieGrid) {
    movieGrid.innerHTML = '<p style="color: #9ca3af; padding: 20px 0;">Đang tải danh sách phim...</p>';
  }

  try {
    let url = `/api/movies?limit=50`;
    if (activeGenre) url += `&genre=${encodeURIComponent(activeGenre)}`;
    if (searchTerm) url += `&search=${encodeURIComponent(searchTerm)}`;

    const res = await fetch(url);
    const json = await res.json();

    if (json.status === 'success' && Array.isArray(json.data)) {
      currentMovies = json.data;
      renderMovieList(currentMovies, searchTerm ? `Kết quả tìm kiếm cho: "${searchTerm}"` : 'Phim Mới Cập Nhật');
    } else {
      if (movieGrid) movieGrid.innerHTML = '<p style="color: #9ca3af; padding: 20px 0;">Hiện chưa có phim nào trong mục này.</p>';
    }
  } catch (err) {
    console.error('Lỗi loadMovies:', err);
    if (movieGrid) movieGrid.innerHTML = '<p style="color: #ef4444; padding: 20px 0;">Không thể tải dữ liệu phim. Vui lòng thử lại sau.</p>';
  }
}

// ==========================================
// 2. PHÁT PHIM & BỘ ĐIỀU KHIỂN YOUTUBE HOÀN CHỈNH
// ==========================================
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

function formatPlayerTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
}

function setVideoSource(url) {
  window.currentPlayingUrl = url || '';
  const playerBox = document.querySelector('.player-box');
  if (!playerBox) return;

  // Dọn dẹp tiến trình YouTube cũ
  if (ytSyncInterval) {
    clearInterval(ytSyncInterval);
    ytSyncInterval = null;
  }
  if (ytNativePlayer && typeof ytNativePlayer.destroy === 'function') {
    try {
      ytNativePlayer.destroy();
    } catch (e) {}
    ytNativePlayer = null;
  }

  // Dọn dẹp Plyr cũ
  if (currentPlyrInstance) {
    try {
      currentPlyrInstance.destroy();
    } catch (e) {}
    currentPlyrInstance = null;
  }

  if (!url) {
    playerBox.innerHTML = '<div style="width:100%;height:100%;background:#000;"></div>';
    return;
  }

  // 1. NHẬN DIỆN & PHÁT YOUTUBE CHUẨN API (CẮT BỎ LOGO, TẮT PHỤ ĐỀ, NÚT TUA 10S CHẠY 100%)
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    let videoId = '';
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    if (match && match[2].length === 11) {
      videoId = match[2];
    }

    playerBox.innerHTML = `
      <div id="ytWrapper" style="position: relative; width: 100%; height: 100%; background: #000; overflow: hidden; user-select: none;">
        <!-- Khung cắt mép viền: Thu nhỏ 120% để đẩy dải tiêu đề và logo YouTube hoàn toàn ra khỏi vùng nhìn -->
        <div style="position: absolute; top: -65px; left: -2%; width: 104%; height: calc(100% + 130px); pointer-events: none;">
          <div id="ytIframeTarget" style="width: 100%; height: 100%;"></div>
        </div>

        <!-- Vùng click trực tiếp lên màn hình để Play/Pause -->
        <div id="ytCenterClick" style="position: absolute; inset: 0; bottom: 58px; z-index: 10; cursor: pointer;"></div>

        <!-- Thanh điều khiển riêng biệt của An Mộc Nhiên -->
        <div id="customControlsBar" style="position: absolute; bottom: 0; left: 0; width: 100%; height: 56px; background: linear-gradient(transparent, rgba(0,0,0,0.95)); display: flex; flex-direction: column; justify-content: flex-end; padding: 0 16px 10px; z-index: 20; box-sizing: border-box;">
          
          <!-- Thanh tua phân cảnh -->
          <div style="width: 100%; margin-bottom: 6px;">
            <input type="range" id="customSeekSlider" min="0" max="100" value="0" step="0.1" 
              style="width: 100%; cursor: pointer; accent-color: #e50914; height: 5px; margin: 0; display: block;">
          </div>

          <!-- Dãy nút điều khiển -->
          <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <button id="btnPlayPauseCustom" style="background: none; border: none; color: #fff; font-size: 1.3rem; cursor: pointer; padding: 0; width: 28px;">⏸</button>
              
              <!-- Nút lùi 10 giây -->
              <button id="btnRewind10" title="Lùi 10s" style="background: #27272a; border: 1px solid #3f3f46; color: #fff; font-size: 0.8rem; font-weight: bold; cursor: pointer; border-radius: 4px; padding: 4px 9px; display: inline-flex; align-items: center; gap: 2px;">
                ◀◀ 10s
              </button>
              
              <!-- Nút tiến 10 giây -->
              <button id="btnForward10" title="Tiến 10s" style="background: #27272a; border: 1px solid #3f3f46; color: #fff; font-size: 0.8rem; font-weight: bold; cursor: pointer; border-radius: 4px; padding: 4px 9px; display: inline-flex; align-items: center; gap: 2px;">
                10s ▶▶
              </button>

              <button id="btnMuteCustom" style="background: none; border: none; color: #fff; font-size: 1.1rem; cursor: pointer; padding: 0;">🔊</button>
              <span id="customTimeText" style="color: #e4e4e7; font-size: 0.85rem; font-family: monospace;">00:00 / 00:00</span>
            </div>

            <div>
              <button id="btnFullscreenCustom" title="Toàn màn hình" style="background: none; border: none; color: #fff; font-size: 1.2rem; cursor: pointer;">⛶</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const initPlayer = () => {
      ytNativePlayer = new YT.Player('ytIframeTarget', {
        videoId: videoId,
        playerVars: {
          autoplay: 1,
          controls: 0,
          rel: 0,
          modestbranding: 1,
          iv_load_policy: 3,
          cc_load_policy: 0,
          playsinline: 1,
          disablekb: 1,
          fs: 0
        },
        events: {
          onReady: (event) => {
            event.target.playVideo();

            // Vòng lặp cập nhật thanh tua & thời gian
            ytSyncInterval = setInterval(() => {
              if (ytNativePlayer && typeof ytNativePlayer.getCurrentTime === 'function') {
                const cur = ytNativePlayer.getCurrentTime() || 0;
                const dur = ytNativePlayer.getDuration() || 0;
                const slider = document.getElementById('customSeekSlider');
                const txt = document.getElementById('customTimeText');

                if (slider && dur > 0) {
                  slider.value = (cur / dur) * 100;
                }
                if (txt) {
                  txt.textContent = `${formatPlayerTime(cur)} / ${formatPlayerTime(dur)}`;
                }
              }
            }, 500);
          },
          onStateChange: (event) => {
            const btn = document.getElementById('btnPlayPauseCustom');
            if (event.data === YT.PlayerState.PLAYING) {
              if (btn) btn.textContent = '⏸';
            } else if (event.data === YT.PlayerState.PAUSED) {
              if (btn) btn.textContent = '▶';
            } else if (event.data === YT.PlayerState.ENDED) {
              playNextEpisode();
            }
          }
        }
      });
    };

    // Chờ YouTube Iframe API sẵn sàng rồi khởi tạo
    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      window.onYouTubeIframeAPIReady = initPlayer;
    }

    // Các sự kiện nút tương tác
    const togglePlay = () => {
      if (!ytNativePlayer || typeof ytNativePlayer.getPlayerState !== 'function') return;
      const state = ytNativePlayer.getPlayerState();
      if (state === YT.PlayerState.PLAYING) {
        ytNativePlayer.pauseVideo();
      } else {
        ytNativePlayer.playVideo();
      }
    };

    const playBtn = document.getElementById('btnPlayPauseCustom');
    if (playBtn) playBtn.onclick = togglePlay;
    const centerClick = document.getElementById('ytCenterClick');
    if (centerClick) centerClick.onclick = togglePlay;

    // Nút Lùi 10s
    const rewBtn = document.getElementById('btnRewind10');
    if (rewBtn) {
      rewBtn.onclick = () => {
        if (ytNativePlayer && typeof ytNativePlayer.getCurrentTime === 'function') {
          const cur = ytNativePlayer.getCurrentTime();
          ytNativePlayer.seekTo(Math.max(0, cur - 10), true);
        }
      };
    }

    // Nút Tiến 10s
    const fwdBtn = document.getElementById('btnForward10');
    if (fwdBtn) {
      fwdBtn.onclick = () => {
        if (ytNativePlayer && typeof ytNativePlayer.getCurrentTime === 'function') {
          const cur = ytNativePlayer.getCurrentTime();
          const dur = ytNativePlayer.getDuration();
          ytNativePlayer.seekTo(Math.min(dur, cur + 10), true);
        }
      };
    }

    // Tua bằng Slider
    const seekSlider = document.getElementById('customSeekSlider');
    if (seekSlider) {
      seekSlider.oninput = (e) => {
        if (ytNativePlayer && typeof ytNativePlayer.getDuration === 'function') {
          const dur = ytNativePlayer.getDuration();
          if (dur > 0) {
            const targetTime = (e.target.value / 100) * dur;
            ytNativePlayer.seekTo(targetTime, true);
          }
        }
      };
    }

    // Nút Bật/Tắt tiếng
    const muteBtn = document.getElementById('btnMuteCustom');
    if (muteBtn) {
      muteBtn.onclick = () => {
        if (!ytNativePlayer || typeof ytNativePlayer.isMuted !== 'function') return;
        if (ytNativePlayer.isMuted()) {
          ytNativePlayer.unMute();
          muteBtn.textContent = '🔊';
        } else {
          ytNativePlayer.mute();
          muteBtn.textContent = '🔇';
        }
      };
    }

    // Nút Toàn màn hình
    const fullBtn = document.getElementById('btnFullscreenCustom');
    if (fullBtn) {
      fullBtn.onclick = () => {
        const wrapper = document.getElementById('ytWrapper');
        if (!document.fullscreenElement) {
          wrapper.requestFullscreen().catch(err => console.warn(err));
        } else {
          document.exitFullscreen();
        }
      };
    }

    return;
  }

  // 2. Nhận diện và nhúng link DoodStream / Playmogo / Streamwish
  if (url.includes('dood') || url.includes('ds2play') || url.includes('playmogo') || url.includes('streamwish') || url.includes('/e/')) {
    let embedUrl = url;
    if (embedUrl.includes('/d/')) {
      embedUrl = embedUrl.replace('/d/', '/e/');
    }

    playerBox.innerHTML = `
      <iframe 
        id="videoPlayer"
        src="${embedUrl}" 
        style="width: 100% !important; height: 100% !important; border: none; display: block;" 
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture" 
        scrolling="no"
        frameborder="0"
        allowfullscreen>
      </iframe>
    `;
    return;
  }

  // 3. Nhận diện và nhúng link Google Drive
  if (url.includes('drive.google.com')) {
    let embedUrl = url;
    const fileIdMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
    if (fileIdMatch && fileIdMatch[1]) {
      embedUrl = `https://drive.google.com/file/d/${fileIdMatch[1]}/preview`;
    } else if (url.includes('/view')) {
      embedUrl = url.replace('/view', '/preview');
    }

    playerBox.innerHTML = `
      <iframe 
        id="videoPlayer"
        src="${embedUrl}" 
        style="width: 100% !important; height: 100% !important; border: none; display: block;" 
        allow="autoplay; fullscreen; encrypted-media" 
        sandbox="allow-scripts allow-same-origin allow-presentation"
        allowfullscreen>
      </iframe>
    `;
    return;
  }

  // 4. File MP4 trực tiếp thông thường
  playerBox.innerHTML = `
    <video 
      id="videoPlayer" 
      src="${url}" 
      controls 
      autoplay 
      playsinline 
      webkit-playsinline 
      controlsList="nodownload" 
      oncontextmenu="return false;"
      style="width: 100% !important; height: 100% !important; display: block; object-fit: contain;">
    </video>
  `;

  const videoEl = playerBox.querySelector('video');
  if (videoEl) {
    videoEl.onended = () => playNextEpisode();
    videoEl.play().catch(err => console.warn('Trình duyệt chặn autoplay:', err));
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

      const fsTitle = document.getElementById('fsMovieTitle');
      if (fsTitle) fsTitle.textContent = movie.title;

      const episodeList = document.getElementById('episodeList');

      if (currentMovieEpisodes.length > 0) {
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

      fetch(`/api/movies/${movieId}/view`, { method: 'POST' });
      loadMovieComments(movieId);

      document.getElementById('playerModal').style.display = 'block';
    }
  } catch (err) {
    alert('Không thể mở thông tin phim này.');
  }
}

function playEpisode(url, btn, idx) {
  if (typeof idx === 'number') currentEpisodeIndex = idx;
  setVideoSource(url);
  document.querySelectorAll('.episode-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

const closeModalBtn = document.getElementById('closeModal');
if (closeModalBtn) {
  closeModalBtn.addEventListener('click', () => {
    const modal = document.getElementById('playerModal');
    
    document.body.classList.remove('is-fullscreen-mode');
    
    if (ytSyncInterval) {
      clearInterval(ytSyncInterval);
      ytSyncInterval = null;
    }
    if (ytNativePlayer && typeof ytNativePlayer.destroy === 'function') {
      try {
        ytNativePlayer.destroy();
      } catch (e) {}
      ytNativePlayer = null;
    }

    if (currentPlyrInstance) {
      try {
        currentPlyrInstance.destroy();
      } catch (e) {}
      currentPlyrInstance = null;
    }

    setVideoSource('');
    if (modal) modal.style.display = 'none';
    currentOpeningMovieId = null;
    currentMovieEpisodes = [];
    currentEpisodeIndex = 0;
    isSwitchingEpisode = false;
  });
}

const searchBtn = document.getElementById('searchBtn');
if (searchBtn) {
  searchBtn.addEventListener('click', () => {
    const searchInput = document.getElementById('searchInput');
    const query = searchInput ? searchInput.value.trim() : '';
    loadMovies(query);
  });
}

// ==========================================
// 3. TÍNH NĂNG YÊU THÍCH (FAVORITES)
// ==========================================
async function loadUserFavorites() {
  if (!userToken) {
    favoriteMovieIds = [];
    return;
  }
  try {
    const res = await fetch('/api/user/favorites', {
      headers: { 'Authorization': `Bearer ${userToken}` }
    });
    if (res.status === 401 || res.status === 403) {
      logoutUser();
      return;
    }
    const json = await res.json();
    if (json.status === 'success') {
      favoriteMovieIds = json.data || [];
    }
  } catch (err) {
    console.warn('Lỗi loadUserFavorites:', err);
  }
}

async function toggleFavorite(e, movieId) {
  if (e) e.stopPropagation();
  const btn = e ? (e.currentTarget || (e.target && e.target.closest ? e.target.closest('.fav-btn') : e.target)) : null;

  if (!userToken) {
    alert('Vui lòng đăng nhập để lưu phim yêu thích!');
    const authModal = document.getElementById('authModal');
    if (authModal) authModal.style.display = 'block';
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
    }
  } catch (err) {
    console.error('Lỗi toggleFavorite:', err);
  }
}

// ==========================================
// 4. BÌNH LUẬN (COMMENTS)
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
    }
  } catch (err) {
    commentList.innerHTML = '<p style="color: #ef4444; font-size: 0.9rem;">Không thể tải bình luận.</p>';
  }
}

async function sendUserComment() {
  const input = document.getElementById('commentInput');
  if (!input) return;
  const content = input.value.trim();

  if (!content) return alert('Vui lòng nhập nội dung bình luận!');
  if (!userToken) {
    alert('Vui lòng đăng nhập để bình luận!');
    const authModal = document.getElementById('authModal');
    if (authModal) authModal.style.display = 'block';
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
    alert('Lỗi kết nối khi gửi bình luận.');
  }
}

// ==========================================
// 5. AUTH & KHỞI TẠO HỆ THỐNG
// ==========================================
function bindAuthButton() {
  const loginBtn = document.getElementById('loginBtn');
  const authModal = document.getElementById('authModal');
  if (loginBtn && authModal) {
    loginBtn.onclick = () => { authModal.style.display = 'block'; };
  }
}

const closeAuthModal = document.getElementById('closeAuthModal');
if (closeAuthModal) {
  closeAuthModal.onclick = () => {
    const authModal = document.getElementById('authModal');
    if (authModal) authModal.style.display = 'none';
  };
}

function renderUserNav() {
  const authNav = document.getElementById('authNav');
  if (!authNav) return;

  if (currentUser && userToken) {
    const adminButton = (currentUser.role === 'admin')
      ? `<a href="/admin" target="_blank" style="text-decoration: none;"><button style="background: #e50914; color: #fff; border: none; padding: 6px 12px; border-radius: 4px; font-weight: bold; cursor: pointer; margin-right: 6px;">Quản Trị</button></a>`
      : '';

    authNav.innerHTML = `
      <div class="user-badge" style="display: flex; align-items: center; gap: 8px;">
        <span style="color: #e4e4e7; font-size: 0.9rem;">Chào, <strong>${currentUser.username}</strong></span>
        ${adminButton}
        <button onclick="logoutUser()" style="background: #27272a; color: #f43f5e; border: 1px solid #3f3f46; padding: 6px 12px; border-radius: 4px; cursor: pointer;">Đăng Xuất</button>
      </div>
    `;
  } else {
    authNav.innerHTML = `
      <button id="loginBtn" class="btn-primary">Đăng Nhập</button>
    `;
    bindAuthButton();
  }
}

function logoutUser() {
  localStorage.removeItem('user_token');
  localStorage.removeItem('user_info');
  location.reload();
}

function switchAuthTab(type) {
  const isLogin = type === 'login';
  const tabLogin = document.getElementById('tabLogin');
  const tabRegister = document.getElementById('tabRegister');
  const userLoginForm = document.getElementById('userLoginForm');
  const userRegisterForm = document.getElementById('userRegisterForm');

  if (tabLogin) tabLogin.classList.toggle('active', isLogin);
  if (tabRegister) tabRegister.classList.toggle('active', !isLogin);
  if (userLoginForm) userLoginForm.style.display = isLogin ? 'block' : 'none';
  if (userRegisterForm) userRegisterForm.style.display = isLogin ? 'none' : 'block';
}

const userRegisterForm = document.getElementById('userRegisterForm');
if (userRegisterForm) {
  userRegisterForm.onsubmit = async (e) => {
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
  };
}

const userLoginForm = document.getElementById('userLoginForm');
if (userLoginForm) {
  userLoginForm.onsubmit = async (e) => {
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
        const authModal = document.getElementById('authModal');
        if (authModal) authModal.style.display = 'none';
        renderUserNav();
        await loadUserFavorites();
        loadMovies();
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert('Không thể kết nối đến máy chủ.');
    }
  };
}

// ==========================================
// 6. CÁC HÀM XỬ LÝ TOÀN MÀN HÌNH NỔI
// ==========================================
window.toggleCustomFullscreen = function() {
  const isFull = document.body.classList.toggle('is-fullscreen-mode');
  const btn = document.getElementById('btnFullscreen');
  const fsTitle = document.getElementById('fsMovieTitle');
  const modalTitle = document.getElementById('modalMovieTitle');

  if (fsTitle && modalTitle) {
    fsTitle.textContent = modalTitle.textContent;
  }

  if (btn) {
    if (isFull) {
      btn.innerHTML = '✕ Thu nhỏ màn hình';
      btn.style.background = '#4b5563';
    } else {
      btn.innerHTML = '⛶ Phóng to / Thu nhỏ';
      btn.style.background = '#e50914';
    }
  }
};

window.exitToHomeDirectly = function() {
  document.body.classList.remove('is-fullscreen-mode');
  const btn = document.getElementById('btnFullscreen');
  if (btn) {
    btn.innerHTML = '⛶ Phóng to / Thu nhỏ';
    btn.style.background = '#e50914';
  }
  const closeBtn = document.getElementById('closeModal');
  if (closeBtn) closeBtn.click();
};

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (document.body.classList.contains('is-fullscreen-mode')) {
      window.toggleCustomFullscreen();
      return;
    }
    const modal = document.getElementById('playerModal');
    if (modal && modal.style.display === 'block') {
      window.exitToHomeDirectly();
    }
  }
});

// ==========================================
// KHỞI CHẠY HỆ THỐNG
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
  renderUserNav();
  loadGenres();
  loadMovies();

  if (userToken) {
    loadUserFavorites();
  }

  const sendCommentBtn = document.getElementById('sendCommentBtn');
  const commentInput = document.getElementById('commentInput');
  if (sendCommentBtn) sendCommentBtn.addEventListener('click', sendUserComment);
  if (commentInput) {
    commentInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendUserComment();
    });
  }
});