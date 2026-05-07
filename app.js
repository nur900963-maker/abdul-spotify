/* ═══════════════════════════════════════════════════════════
   VIBESPLAYER — app.js
/* ═══════════════════════════════════════════════════════════
   VIBESPLAYER — app.js
   YouTube Data API v3 + IFrame Player API
   by Abdul & Murid Teladan © 2026
═══════════════════════════════════════════════════════════ */

// ─────────────────────────────────────────────
// API KEY — disimpan di localStorage, bisa diisi
// lewat tombol ⚙️ di pojok kanan atas
// ─────────────────────────────────────────────
let API_KEY = localStorage.getItem('vp_api_key') || 'AIzaSyBdd7QR5flpyW4VI9hfZzCKgfhcQiLpAqE';

const YT_SEARCH   = 'https://www.googleapis.com/youtube/v3/search';
const YT_VIDEOS   = 'https://www.googleapis.com/youtube/v3/videos';

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
let ytPlayer       = null;
let ytReady        = false;
let queue          = [];
let queueIndex     = -1;
let isShuffle      = false;
let repeatMode     = 0; // 0=off 1=all 2=one
let isMuted        = false;
let prevVol        = 80;
let progressTimer  = null;
let currentVideo   = null;
let liked          = JSON.parse(localStorage.getItem('vp_liked') || '[]');
let searchDebounce = null;

// ─────────────────────────────────────────────
// YOUTUBE IFRAME API READY
// ─────────────────────────────────────────────
window.onYouTubeIframeAPIReady = () => {
  ytPlayer = new YT.Player('ytPlayer', {
    height: '1', width: '1',
    playerVars: { autoplay: 0, controls: 0, disablekb: 1, fs: 0, modestbranding: 1, playsinline: 1 },
    events: {
      onReady:       () => { ytReady = true; setVol(80); },
      onStateChange: onPlayerStateChange,
      onError:       onPlayerError,
    }
  });
};

function onPlayerStateChange(e) {
  const S = YT.PlayerState;
  if (e.data === S.PLAYING) {
    updatePlayBtn(true);
    startProgressTimer();
  } else if (e.data === S.PAUSED) {
    updatePlayBtn(false);
    stopProgressTimer();
  } else if (e.data === S.ENDED) {
    stopProgressTimer();
    handleTrackEnd();
  } else if (e.data === S.BUFFERING) {
    document.getElementById('pcPlay').innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
  }
}

function onPlayerError(e) {
  console.warn('YT Player error:', e.data);
  showToast('⚠️ Lagu tidak tersedia, skip ke berikutnya...');
  setTimeout(nextTrack, 1500);
}

function handleTrackEnd() {
  if (repeatMode === 2) {
    ytPlayer.seekTo(0);
    ytPlayer.playVideo();
    return;
  }
  nextTrack();
}

// ─────────────────────────────────────────────
// YOUTUBE API FETCH
// ─────────────────────────────────────────────
async function ytSearch(query, maxResults = 20) {
  if (!API_KEY) {
    showApiKeyModal();
    return [];
  }
  try {
    const url = `${YT_SEARCH}?part=snippet&type=video&videoCategoryId=10&q=${encodeURIComponent(query)}&maxResults=${maxResults}&key=${API_KEY}&regionCode=ID&relevanceLanguage=id`;
    const r = await fetch(url);
    const d = await r.json();
    if (d.error) { handleApiError(d.error); return []; }
    return (d.items || []).map(itemToTrack);
  } catch (err) {
    console.error(err);
    showToast('Gagal mengambil data, cek koneksi internet');
    return [];
  }
}

async function ytSearchGlobal(query, maxResults = 20) {
  if (!API_KEY) return [];
  try {
    const url = `${YT_SEARCH}?part=snippet&type=video&videoCategoryId=10&q=${encodeURIComponent(query)}&maxResults=${maxResults}&key=${API_KEY}`;
    const r = await fetch(url);
    const d = await r.json();
    if (d.error) { handleApiError(d.error); return []; }
    return (d.items || []).map(itemToTrack);
  } catch (err) {
    console.error(err);
    return [];
  }
}

function handleApiError(err) {
  if (err.code === 403) {
    showToast('❌ API Key tidak valid atau quota habis!');
    document.getElementById('apiWarn').style.display = 'flex';
  } else if (err.code === 400) {
    showToast('❌ API Key salah format');
  } else {
    showToast('Error: ' + err.message);
  }
}

function itemToTrack(item) {
  const id   = item.id?.videoId || item.id;
  const snip = item.snippet || {};
  return {
    id:        id,
    title:     snip.title     || 'Unknown',
    artist:    snip.channelTitle || '—',
    thumb:     snip.thumbnails?.medium?.url || snip.thumbnails?.default?.url || '',
    thumbHq:   snip.thumbnails?.high?.url   || snip.thumbnails?.medium?.url  || '',
    duration:  snip.duration  || '',
    uri:       `https://www.youtube.com/watch?v=${id}`,
  };
}

// ─────────────────────────────────────────────
// PLAYBACK
// ─────────────────────────────────────────────
function playTrack(track, addToQueue = true) {
  if (!track?.id) return;
  if (!ytReady) { showToast('Player belum siap, coba lagi...'); return; }

  currentVideo = track;

  if (addToQueue) {
    // check if already in queue
    const existing = queue.findIndex(t => t.id === track.id);
    if (existing >= 0) {
      queueIndex = existing;
    } else {
      queue.splice(queueIndex + 1, 0, track);
      queueIndex = queueIndex + 1;
    }
  }

  ytPlayer.loadVideoById(track.id);
  updatePlayerBar(track);
  renderQueuePage();
  checkLikeState(track.id);
}

function playQueue(tracks, startIndex = 0) {
  if (!tracks.length) return;
  queue      = [...tracks];
  queueIndex = startIndex;
  playTrack(queue[queueIndex], false);
}

function togglePlay() {
  if (!ytReady || !currentVideo) return;
  const state = ytPlayer.getPlayerState();
  if (state === YT.PlayerState.PLAYING) {
    ytPlayer.pauseVideo();
  } else {
    ytPlayer.playVideo();
  }
}

function prevTrack() {
  if (!queue.length) return;
  const pos = ytPlayer.getCurrentTime?.() || 0;
  if (pos > 3) { ytPlayer.seekTo(0); return; }
  if (queueIndex > 0) {
    queueIndex--;
    playTrack(queue[queueIndex], false);
  } else if (repeatMode === 1) {
    queueIndex = queue.length - 1;
    playTrack(queue[queueIndex], false);
  }
}

function nextTrack() {
  if (!queue.length) return;
  if (isShuffle) {
    let next;
    do { next = Math.floor(Math.random() * queue.length); } while (next === queueIndex && queue.length > 1);
    queueIndex = next;
  } else if (queueIndex < queue.length - 1) {
    queueIndex++;
  } else if (repeatMode === 1) {
    queueIndex = 0;
  } else {
    showToast('Tidak ada lagu berikutnya');
    return;
  }
  playTrack(queue[queueIndex], false);
}

function toggleShuffle() {
  isShuffle = !isShuffle;
  document.getElementById('pcShuffle').classList.toggle('active', isShuffle);
  showToast(isShuffle ? '🔀 Shuffle aktif' : '🔀 Shuffle nonaktif');
}

function toggleRepeat() {
  repeatMode = (repeatMode + 1) % 3;
  const btn = document.getElementById('pcRepeat');
  const icons = ['fa-repeat','fa-repeat','fa-rotate-right'];
  btn.innerHTML = `<i class="fas ${icons[repeatMode]}"></i>`;
  btn.classList.toggle('active', repeatMode > 0);
  const msgs = ['🔁 Repeat off','🔁 Repeat all','🔂 Repeat one'];
  showToast(msgs[repeatMode]);
}

function setVol(val) {
  prevVol = val;
  if (ytReady) ytPlayer.setVolume(Number(val));
  const icon = document.getElementById('volIcon');
  if (!icon) return;
  icon.className = val == 0 ? 'fas fa-volume-xmark' : val < 50 ? 'fas fa-volume-low' : 'fas fa-volume-high';
}

function toggleMute() {
  const slider = document.getElementById('volSlider');
  if (isMuted) {
    isMuted = false;
    slider.value = prevVol;
    setVol(prevVol);
  } else {
    isMuted = true;
    prevVol = slider.value;
    slider.value = 0;
    if (ytReady) ytPlayer.setVolume(0);
  }
}

function seekTo(e) {
  if (!ytReady || !currentVideo) return;
  const bar  = document.getElementById('progBar');
  const rect = bar.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const dur   = ytPlayer.getDuration?.() || 0;
  ytPlayer.seekTo(ratio * dur, true);
}

// ─────────────────────────────────────────────
// PROGRESS TIMER
// ─────────────────────────────────────────────
function startProgressTimer() {
  stopProgressTimer();
  progressTimer = setInterval(() => {
    if (!ytReady) return;
    const cur = ytPlayer.getCurrentTime?.() || 0;
    const dur = ytPlayer.getDuration?.() || 0;
    if (!dur) return;
    const pct = (cur / dur) * 100;
    document.getElementById('progFill').style.width = pct + '%';
    document.getElementById('pCur').textContent = fmtSec(cur);
    document.getElementById('pDur').textContent = fmtSec(dur);
  }, 500);
}

function stopProgressTimer() {
  clearInterval(progressTimer);
}

function fmtSec(s) {
  s = Math.floor(s);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2,'0')}`;
}

// ─────────────────────────────────────────────
// PLAYER BAR UI
// ─────────────────────────────────────────────
function updatePlayerBar(track) {
  document.getElementById('pTitle').textContent  = track.title;
  document.getElementById('pArtist').textContent = track.artist;
  document.getElementById('pThumb').src          = track.thumbHq || track.thumb;
  document.getElementById('progFill').style.width = '0%';
  document.getElementById('pCur').textContent = '0:00';
  document.getElementById('pDur').textContent = '0:00';
}

function updatePlayBtn(playing) {
  document.getElementById('pcPlay').innerHTML = playing
    ? '<i class="fas fa-pause"></i>'
    : '<i class="fas fa-play"></i>';
}

function checkLikeState(id) {
  const heart = document.getElementById('pHeart');
  if (liked.find(t => t.id === id)) {
    heart.innerHTML = '<i class="fas fa-heart"></i>';
    heart.classList.add('liked');
  } else {
    heart.innerHTML = '<i class="far fa-heart"></i>';
    heart.classList.remove('liked');
  }
}

// ─────────────────────────────────────────────
// LIKED / FAVORIT
// ─────────────────────────────────────────────
function toggleLikeNow() {
  if (!currentVideo) return;
  toggleLike(currentVideo);
  checkLikeState(currentVideo.id);
}

function toggleLike(track) {
  const idx = liked.findIndex(t => t.id === track.id);
  if (idx >= 0) {
    liked.splice(idx, 1);
    showToast('Dihapus dari favorit');
  } else {
    liked.unshift(track);
    showToast('❤️ Ditambahkan ke favorit!');
  }
  localStorage.setItem('vp_liked', JSON.stringify(liked));
  renderLikedPage();
}

function isLiked(id) {
  return !!liked.find(t => t.id === id);
}

// ─────────────────────────────────────────────
// RENDER HELPERS
// ─────────────────────────────────────────────
function renderCards(tracks, containerId, isHScroll = false) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!tracks.length) {
    el.innerHTML = `<div style="color:var(--muted);font-size:13px;padding:20px 0">Tidak ada hasil</div>`;
    return;
  }
  el.innerHTML = tracks.map((t, i) => `
    <div class="card" onclick="playQueue(window._lastTracks?.${containerId} || [], ${i})">
      <div class="card-art">
        <img src="${esc(t.thumb)}" alt="${esc(t.title)}" loading="lazy"
             onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22%3E%3Crect width=%22200%22 height=%22200%22 fill=%22%231a1a1a%22/%3E%3Ctext x=%22100%22 y=%22110%22 text-anchor=%22middle%22 fill=%22%23444%22 font-size=%2248%22%3E♪%3C/text%3E%3C/svg%3E'">
        <div class="card-play"><i class="fas fa-play"></i></div>
      </div>
      <div class="card-title">${esc(t.title)}</div>
      <div class="card-sub">${esc(t.artist)}</div>
    </div>
  `).join('');

  // store tracks ref for queue play
  if (!window._lastTracks) window._lastTracks = {};
  window._lastTracks[containerId] = tracks;

  // re-bind clicks properly
  const cards = el.querySelectorAll('.card');
  cards.forEach((card, i) => {
    card.onclick = () => playQueue(tracks, i);
  });
}

function renderTrackList(tracks, containerId, emptyId) {
  const list  = document.getElementById(containerId);
  const empty = emptyId ? document.getElementById(emptyId) : null;
  if (!list) return;

  if (!tracks.length) {
    list.innerHTML = '';
    if (empty) empty.style.display = 'flex';
    return;
  }
  if (empty) empty.style.display = 'none';

  list.innerHTML = tracks.map((t, i) => `
    <div class="track-row" data-id="${esc(t.id)}">
      <span class="tr-num">${i + 1}</span>
      <img class="tr-thumb" src="${esc(t.thumb)}" alt=""
           onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2244%22 height=%2244%22%3E%3Crect width=%2244%22 height=%2244%22 fill=%22%231a1a1a%22/%3E%3C/svg%3E'">
      <div class="tr-info">
        <div class="tr-title">${esc(t.title)}</div>
        <div class="tr-artist">${esc(t.artist)}</div>
      </div>
      <button class="tr-heart ${isLiked(t.id) ? 'liked' : ''}" onclick="event.stopPropagation();toggleLike(window._trackRef_${containerId}[${i}]);this.classList.toggle('liked');this.innerHTML=this.classList.contains('liked')?'<i class=\\'fas fa-heart\\'></i>':'<i class=\\'far fa-heart\\'></i>'">
        <i class="${isLiked(t.id) ? 'fas' : 'far'} fa-heart"></i>
      </button>
    </div>
  `).join('');

  window[`_trackRef_${containerId}`] = tracks;

  const rows = list.querySelectorAll('.track-row');
  rows.forEach((row, i) => {
    row.addEventListener('click', () => playQueue(tracks, i));
  });
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// ─────────────────────────────────────────────
// PAGES
// ─────────────────────────────────────────────
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nlink').forEach(a => a.classList.remove('active'));

  const pageMap = { home:'pageHome', search:'pageSearch', trending:'pageTrending', liked:'pageLiked', queue:'pageQueue' };
  const pg = document.getElementById(pageMap[name]);
  if (pg) pg.classList.add('active');

  const navItems = document.querySelectorAll('.nlink');
  navItems.forEach(a => { if (a.dataset.page === name) a.classList.add('active'); });

  if (name === 'liked')   renderLikedPage();
  if (name === 'queue')   renderQueuePage();
  if (name === 'trending' && !document.getElementById('trendGrid').children.length) {
    loadTrending('trending musik indonesia 2026', document.querySelector('.tab.active'));
  }
}

// ─────────────────────────────────────────────
// HOME DATA
// ─────────────────────────────────────────────
async function loadHomeData() {
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Selamat Pagi ☀️' : hour < 17 ? 'Selamat Siang 🎧' : hour < 21 ? 'Selamat Sore 🌇' : 'Selamat Malam 🌙';
  document.getElementById('greetMsg').textContent = greet;

  if (!API_KEY) {
    showApiKeyModal();
    return;
  }

  document.getElementById('apiWarn').style.display = 'none';

  const [trending, pop, lofi, global] = await Promise.all([
    ytSearch('trending musik indonesia 2026', 12),
    ytSearch('lagu pop indonesia terbaru 2026', 12),
    ytSearch('lofi chill study music indonesia', 12),
    ytSearchGlobal('top hits global music 2026', 12),
  ]);

  renderCards(trending, 'homeTrending', true);
  renderCards(pop,      'homePop',      true);
  renderCards(lofi,     'homeLofi',     true);
  renderCards(global,   'homeGlobal',   true);
}

// ─────────────────────────────────────────────
// TRENDING PAGE
// ─────────────────────────────────────────────
async function loadTrending(query, tabEl) {
  if (tabEl) {
    document.querySelectorAll('#trendTabs .tab').forEach(t => t.classList.remove('active'));
    tabEl.classList.add('active');
  }

  const grid = document.getElementById('trendGrid');
  grid.innerHTML = `<div class="status"><i class="fas fa-circle-notch spin-icon"></i> Memuat trending...</div>`;

  const tracks = await ytSearch(query, 24);
  renderCards(tracks, 'trendGrid');
}

// ─────────────────────────────────────────────
// SEARCH
// ─────────────────────────────────────────────
function initSearch() {
  // top search bar
  const topBtn = document.getElementById('topSearchBtn');
  const topIn  = document.getElementById('topSearch');
  topBtn.addEventListener('click', () => {
    const q = topIn.value.trim();
    if (!q) { showPage('search'); document.getElementById('bigSearch').focus(); return; }
    showPage('search');
    document.getElementById('bigSearch').value = q;
    doSearch(q);
  });
  topIn.addEventListener('keypress', e => { if (e.key === 'Enter') topBtn.click(); });

  // big search
  const bigIn = document.getElementById('bigSearch');
  bigIn.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => { if (bigIn.value.trim()) doSearch(bigIn.value.trim()); }, 600);
  });
  bigIn.addEventListener('keypress', e => { if (e.key === 'Enter') doSearch(bigIn.value.trim()); });
}

async function doSearch(q) {
  if (!q) return;
  showPage('search');

  const status = document.getElementById('searchStatus');
  const grid   = document.getElementById('searchGrid');
  status.innerHTML = '<i class="fas fa-circle-notch spin-icon"></i> Mencari "' + esc(q) + '"...';
  status.classList.remove('hidden');
  grid.innerHTML = '';

  const tracks = await ytSearch(q, 24);
  status.classList.add('hidden');

  if (!tracks.length) {
    status.innerHTML = '😕 Tidak ada hasil untuk "' + esc(q) + '"';
    status.classList.remove('hidden');
    return;
  }
  renderCards(tracks, 'searchGrid');
}

function searchAndGo(query) {
  showPage('search');
  document.getElementById('bigSearch').value = query;
  doSearch(query);
  return false;
}

// ─────────────────────────────────────────────
// LIKED PAGE
// ─────────────────────────────────────────────
function renderLikedPage() {
  renderTrackList(liked, 'likedList', 'likedEmpty');
}

// ─────────────────────────────────────────────
// QUEUE PAGE
// ─────────────────────────────────────────────
function renderQueuePage() {
  const list  = document.getElementById('queueList');
  const empty = document.getElementById('queueEmpty');
  if (!queue.length) {
    list.innerHTML = '';
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';

  list.innerHTML = queue.map((t, i) => `
    <div class="track-row ${i === queueIndex ? 'playing' : ''}" style="${i === queueIndex ? 'background:rgba(29,185,84,0.08);border-radius:8px;' : ''}">
      <span class="tr-num">${i === queueIndex ? '<i class="fas fa-volume-up" style="color:var(--green)"></i>' : i + 1}</span>
      <img class="tr-thumb" src="${esc(t.thumb)}" alt="">
      <div class="tr-info">
        <div class="tr-title" style="${i === queueIndex ? 'color:var(--green)' : ''}">${esc(t.title)}</div>
        <div class="tr-artist">${esc(t.artist)}</div>
      </div>
      <button onclick="event.stopPropagation();removeFromQueue(${i})" style="color:var(--muted);font-size:13px;padding:4px 8px;" title="Hapus"><i class="fas fa-times"></i></button>
    </div>
  `).join('');

  const rows = list.querySelectorAll('.track-row');
  rows.forEach((row, i) => {
    row.addEventListener('click', () => {
      queueIndex = i;
      playTrack(queue[i], false);
    });
  });
}

function removeFromQueue(i) {
  if (i === queueIndex) { showToast('Tidak bisa hapus lagu yang sedang diputar'); return; }
  queue.splice(i, 1);
  if (i < queueIndex) queueIndex--;
  renderQueuePage();
  showToast('Dihapus dari antrian');
}

// ─────────────────────────────────────────────
// SIDEBAR NAV LINKS
// ─────────────────────────────────────────────
function initNavLinks() {
  document.querySelectorAll('.nlink').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      showPage(a.dataset.page);
    });
  });
}

// ─────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────
let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

// ─────────────────────────────────────────────
// WELCOME SCREEN
// ─────────────────────────────────────────────
function initWelcome() {
  const entered = sessionStorage.getItem('vp_entered');
  const welcome = document.getElementById('welcomeScreen');
  const app     = document.getElementById('mainApp');

  if (entered) {
    welcome.style.display = 'none';
    app.classList.remove('hidden');
    return;
  }

  document.getElementById('enterBtn').addEventListener('click', () => {
    welcome.style.animation = 'wFadeOut 0.5s ease forwards';
    setTimeout(() => {
      welcome.style.display = 'none';
      app.classList.remove('hidden');
      sessionStorage.setItem('vp_entered', '1');
      app.style.animation = 'fadeUp 0.4s ease';
    }, 450);
  });
}

// add fadeout keyframe dynamically
const style = document.createElement('style');
style.textContent = `@keyframes wFadeOut { to { opacity:0; transform: scale(1.03); } }`;
document.head.appendChild(style);

// ─────────────────────────────────────────────
// API KEY MODAL
// ─────────────────────────────────────────────
function showApiKeyModal() {
  document.getElementById('apiKeyModal').classList.remove('hidden');
  document.getElementById('apiKeyInput').value = API_KEY || '';
  document.getElementById('apiKeyInput').focus();
}

function hideApiKeyModal() {
  document.getElementById('apiKeyModal').classList.add('hidden');
}

function saveApiKey() {
  const val = document.getElementById('apiKeyInput').value.trim();
  if (!val) { showToast('⚠️ API Key tidak boleh kosong!'); return; }
  API_KEY = val;
  localStorage.setItem('vp_api_key', val);
  hideApiKeyModal();
  document.getElementById('apiWarn').style.display = 'none';
  showToast('✅ API Key tersimpan! Memuat musik...');
  loadHomeData();
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initWelcome();
  initNavLinks();
  initSearch();
  loadHomeData();
});