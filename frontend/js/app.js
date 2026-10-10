// ====================================
// app.js — 앱 진입점 (초기화 + 이벤트 연결)
// ====================================

import state, { loadEpisodeState, saveStateToLocal, getGlobalExtracted, getGlobalCompletedEpisodes, addYouTubeToHistory, getYouTubeHistory, getLastWatched, saveLastWatched } from './state.js';
import * as api from './api.js';
import * as player from './player.js';
import { renderSubtitles, updateActiveSubtitleUI, clearOverlays, findActiveSubtitleIndex, toggleStar, isShortSubtitle } from './subtitles.js';
import { setMode, bindModeEvents, updateDictationPanel, toggleBlur, renderStarredList } from './modes.js';
import { initDictionary, showWordDictionary } from './dict.js';
import { initSettingsModal, openSettingsModal } from './settings.js';

// Expose global triggers
window._showWordDictionary = showWordDictionary;
window._renderStarredList = renderStarredList;

// --- DOM References ---
const episodeSelect = document.getElementById("episode-select");
const subtitleSearchBtn = document.getElementById("subtitle-search-btn");
const episodeCompleteBtn = document.getElementById("episode-complete-btn");
const ankiStatusBtn = document.getElementById("anki-status-btn");
const ankiStatusDot = document.getElementById("anki-status-dot");
const ankiStatusLabel = document.getElementById("anki-status-label");
const progressBarContainer = document.getElementById("progress-bar-container");
const abLoopBtn = document.getElementById("ab-loop-btn");
const dictationInput = document.getElementById("dictation-input");

// YouTube DOM
const sourceLocalBtn = document.getElementById("source-local-btn");
const sourceYoutubeBtn = document.getElementById("source-youtube-btn");
const sourceExploreBtn = document.getElementById("source-explore-btn");
const localControls = document.getElementById("local-controls");
const youtubeControls = document.getElementById("youtube-controls");
const youtubeUrlInput = document.getElementById("youtube-url-input");
const youtubeLoadBtn = document.getElementById("youtube-load-btn");
const youtubeHistorySelect = document.getElementById("youtube-history-select");

// Main Sections
const videoSection = document.querySelector(".video-section");
const sidebar = document.querySelector(".sidebar");
const exploreSection = document.getElementById("explore-section");
const exploreSearchInput = document.getElementById("explore-search-input");
const exploreSearchBtn = document.getElementById("explore-search-btn");
const exploreTagsContainer = document.getElementById("explore-tags-container");
const exploreVideoGrid = document.getElementById("explore-video-grid");
const exploreLoadingSpinner = document.getElementById("explore-loading-spinner");

// Subscriptions DOM
const exploreSubChipsContainer = document.getElementById("explore-sub-chips-container");
const googleQuickConnectBtn = document.getElementById("google-quick-connect-btn");
const googleQuickStatusText = document.getElementById("google-quick-status-text");

// --- Source Mode ---
let sourceMode = 'local'; // 'local', 'youtube', 'explore'

// --- Initialize ---
init();

async function init() {
  // 1. Initialize interactive popup dictionary & Settings modal
  initDictionary();
  initSettingsModal();
  window._reloadEpisodes = fetchEpisodes;
  window._refreshSubscriptions = loadSubscriptionsBar;

  // 2. Bind events IMMEDIATELY so buttons, tabs, shortcuts are 100% responsive right away
  bindEvents();
  
  // 3. Set initial mode to Listening mode (apply blur)
  const listeningBtn = document.getElementById("mode-listening");
  if (listeningBtn) setMode(listeningBtn);
  
  loadYouTubeHistory();
  loadSubscriptionsBar();
  
  // 4. Check Anki status in background
  checkAnkiStatus();
  setInterval(checkAnkiStatus, 5000);
  
  // 4. Fetch episodes
  await fetchEpisodes();
  
  // 5. Restore last watched state
  try {
    const lastWatched = getLastWatched();
    if (lastWatched && lastWatched.epKey) {
      if (lastWatched.sourceMode === 'youtube') {
        const videoId = lastWatched.epKey.replace('yt_', '');
        const url = `https://www.youtube.com/watch?v=${videoId}`;
        youtubeUrlInput.value = url;
        switchSource('youtube');
        await loadYouTubeVideo(url);
      } else {
        episodeSelect.value = lastWatched.epKey;
        switchSource('local');
        await loadEpisode(lastWatched.epKey);
      }
      
      // Seek to last position
      if (lastWatched.timeMs) {
        setTimeout(() => {
          player.seekTo(lastWatched.timeMs);
        }, 800);
      }
    }
  } catch (e) {
    console.error("Failed to restore last watched", e);
  }
}

// --- API Calls ---
async function fetchEpisodes(forceRefresh = false) {
  try {
    const list = await api.fetchEpisodeList(forceRefresh);
    state.episodes = Array.isArray(list) ? list : [];
    const globalExtracted = getGlobalExtracted() || {};
    const globalCompleted = (typeof getGlobalCompletedEpisodes === 'function')
      ? getGlobalCompletedEpisodes() 
      : new Set();
    
    if (state.episodes.length === 0) {
      episodeSelect.innerHTML = '<option value="">등록된 에피소드가 없습니다</option>';
      return;
    }

    episodeSelect.innerHTML = '<option value="">에피소드를 선택하세요</option>';
    state.episodes.forEach(ep => {
      const option = document.createElement("option");
      option.value = ep.ep_key;
      const hasExtracted = globalExtracted[ep.ep_key] && globalExtracted[ep.ep_key].length > 0;
      const isCompleted = globalCompleted && typeof globalCompleted.has === 'function' && globalCompleted.has(ep.ep_key);
      
      let prefix = "";
      if (isCompleted) prefix += "[완료] ";
      if (hasExtracted) prefix += "[추출] ";
      
      option.textContent = `${prefix}${ep.ep_key.toUpperCase()} - ${ep.video_filename} (${ep.format.toUpperCase()})`;
      episodeSelect.appendChild(option);
    });
  } catch (err) {
    console.error("Failed to fetch episodes:", err);
    episodeSelect.innerHTML = '<option value="">에피소드 로드 실패 (다시 시도)</option>';
  }
}

async function checkAnkiStatus(showFeedback = false) {
  if (showFeedback && ankiStatusLabel) ankiStatusLabel.textContent = "확인 중...";
  state.ankiConnected = await api.checkAnkiConnection();
  if (ankiStatusDot) ankiStatusDot.classList.toggle("connected", state.ankiConnected);
  if (ankiStatusLabel) {
    ankiStatusLabel.textContent = state.ankiConnected ? "Anki 연결됨" : "Anki 연결";
  }
}

// --- Load Episode (Local) ---
async function loadEpisode(epKey) {
  if (!epKey) return;
  
  state.currentEpisode = state.episodes.find(e => e.ep_key === epKey);
  if (!state.currentEpisode) return;

  // AVI check
  if (state.currentEpisode.format === "avi") {
    player.showAviWarning();
    state.subtitles = [];
    renderSubtitles();
    return;
  }

  // Set video source
  player.setSource(epKey);
  
  // Reset state
  state.currentSubtitleIndex = -1;
  state.hasPausedForShadowing = false;
  clearOverlays();
  
  // Load saved state for this episode
  loadEpisodeState(epKey);
  
  // Fetch subtitles
  const subtitleList = document.getElementById("subtitle-list");
  subtitleList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">자막 분석 중...</div>';
  
  try {
    state.subtitles = await api.fetchSubtitles(epKey);
    renderSubtitles();
    subtitleSearchBtn.style.display = "inline-block";
    episodeCompleteBtn.style.display = "inline-block";
    
    // Update complete button state
    const globalCompleted = getGlobalCompletedEpisodes ? getGlobalCompletedEpisodes() : new Set();
    const isCompleted = globalCompleted.has(epKey);
    if (isCompleted) {
      episodeCompleteBtn.textContent = "완료됨 (취소)";
      episodeCompleteBtn.classList.add("completed");
    } else {
      episodeCompleteBtn.textContent = "완료 표시";
      episodeCompleteBtn.classList.remove("completed");
    }
  } catch (err) {
    console.error("Failed to load subtitles:", err);
    subtitleList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--danger);">자막 로드 및 번역 실패</div>';
  }
}

// --- Load YouTube Video ---
async function loadYouTubeVideo(url) {
  const subtitleList = document.getElementById("subtitle-list");
  subtitleList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">유튜브 영상 로딩 중...</div>';
  
  youtubeLoadBtn.innerHTML = "로딩 중...";
  youtubeLoadBtn.disabled = true;
  
  try {
    // 1. Fetch video info
    const info = await api.fetchYouTubeInfo(url);
    if (!info.success) throw new Error(info.error);
    
    const videoId = info.video_id;
    const epKey = `yt_${videoId}`;
    
    // 2. Set state
    state.currentEpisode = {
      ep_key: epKey,
      video_filename: info.title,
      format: "youtube",
    };
    
    // 3. Load YouTube player
    player.setYouTubeSource(videoId);
    
    // 4. Reset state
    state.currentSubtitleIndex = -1;
    state.hasPausedForShadowing = false;
    clearOverlays();
    loadEpisodeState(epKey);
    
    // 5. Fetch subtitles
    subtitleList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">자막 추출 중... (최초 로드 시 시간이 걸릴 수 있습니다)</div>';
    
    state.subtitles = await api.fetchYouTubeSubtitles(videoId);
    
    if (state.subtitles.length === 0) {
      subtitleList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--danger);">이 영상에는 영어 자막이 없습니다</div>';
    } else {
      renderSubtitles();
    }
    
    // 6. Save to history
    addYouTubeToHistory(videoId, info.title);
    loadYouTubeHistory();
    
    // 7. Hide local-only buttons
    subtitleSearchBtn.style.display = "none";
    episodeCompleteBtn.style.display = "none";
    
    // Show success
    youtubeLoadBtn.innerHTML = "완료!";
    youtubeLoadBtn.style.color = "var(--success)";
    setTimeout(() => {
      youtubeLoadBtn.innerHTML = "로드";
      youtubeLoadBtn.style.color = "";
      youtubeLoadBtn.disabled = false;
    }, 2000);
    
  } catch (err) {
    console.error("Failed to load YouTube video:", err);

    const cleanTerm = url.replace(/https?:\/\/(www\.)?youtube\.com\/watch\?v=/i, '')
                         .replace(/https?:\/\/youtu\.be\//i, '')
                         .trim();

    let hintHtml = `<div style="padding: 20px; text-align: center; color: var(--danger);">유튜브 로드 실패: ${err.message}</div>`;

    if (cleanTerm && cleanTerm.length < 11) {
      hintHtml += `
        <div style="padding: 14px 18px; text-align: center; color: var(--text-secondary); font-size: 13px; background: var(--bg-surface-2); margin: 0 16px; border-radius: var(--radius-md); border: 1px solid var(--border); display: flex; flex-direction: column; gap: 8px;">
          <div style="font-weight: 500; color: var(--text-primary);">
            내 컴퓨터의 로컬 영상(Modern Family 등)을 보시려면 상단 <strong>[로컬]</strong> 탭을 클릭해 주세요.
          </div>
          <button class="btn primary" id="auto-explore-hint-btn" style="height: 32px; font-size: 12px; align-self: center; display: inline-flex; align-items: center; gap: 6px;">
            <span class="material-symbols-outlined" style="font-size: 16px;">search</span>
            <span>'${cleanTerm}' 유튜브 탐색하기</span>
          </button>
        </div>
      `;
    }

    subtitleList.innerHTML = hintHtml;

    const autoExploreBtn = document.getElementById("auto-explore-hint-btn");
    if (autoExploreBtn) {
      autoExploreBtn.addEventListener("click", () => {
        switchSource('explore');
        if (exploreSearchInput) exploreSearchInput.value = cleanTerm;
        performExploreSearch(cleanTerm);
      });
    }

    youtubeLoadBtn.innerHTML = "실패";
    setTimeout(() => {
      youtubeLoadBtn.innerHTML = "로드";
      youtubeLoadBtn.disabled = false;
    }, 3000);
  }
}

// --- YouTube History ---
function loadYouTubeHistory() {
  const history = getYouTubeHistory();
  youtubeHistorySelect.innerHTML = '<option value="">최근 영상...</option>';
  history.forEach(v => {
    const option = document.createElement("option");
    option.value = v.id;
    const shortTitle = v.title.length > 30 ? v.title.slice(0, 30) + "..." : v.title;
    option.textContent = shortTitle;
    youtubeHistorySelect.appendChild(option);
  });
}

// --- Source Toggle ---
function switchSource(mode) {
  sourceMode = mode;
  if (mode === 'local') {
    sourceLocalBtn.classList.add('active');
    sourceYoutubeBtn.classList.remove('active');
    if (sourceExploreBtn) sourceExploreBtn.classList.remove('active');
    
    if (videoSection) videoSection.style.display = "flex";
    if (sidebar) sidebar.style.display = "flex";
    if (exploreSection) exploreSection.style.display = "none";

    localControls.style.display = "flex";
    youtubeControls.style.display = "none";
  } else if (mode === 'youtube') {
    sourceLocalBtn.classList.remove('active');
    sourceYoutubeBtn.classList.add('active');
    if (sourceExploreBtn) sourceExploreBtn.classList.remove('active');

    if (videoSection) videoSection.style.display = "flex";
    if (sidebar) sidebar.style.display = "flex";
    if (exploreSection) exploreSection.style.display = "none";

    localControls.style.display = "none";
    youtubeControls.style.display = "flex";
  } else if (mode === 'explore') {
    sourceLocalBtn.classList.remove('active');
    sourceYoutubeBtn.classList.remove('active');
    if (sourceExploreBtn) sourceExploreBtn.classList.add('active');

    if (videoSection) videoSection.style.display = "none";
    if (sidebar) sidebar.style.display = "none";
    if (exploreSection) exploreSection.style.display = "flex";

    localControls.style.display = "none";
    youtubeControls.style.display = "flex";

    // Auto-search default tag if grid is empty
    if (exploreVideoGrid && exploreVideoGrid.children.length === 0) {
      const activeTag = exploreTagsContainer ? exploreTagsContainer.querySelector(".explore-tag-chip.active") : null;
      const initialQuery = activeTag ? activeTag.dataset.query : "TED-Ed english";
      performExploreSearch(initialQuery);
    }
  }
}

// --- YouTube In-App Explore Search ---
let isSearchingYouTube = false;

async function performExploreSearch(query) {
  if (!query || !query.trim() || isSearchingYouTube) return;
  const q = query.trim();
  
  // If user entered full YouTube URL directly, load it immediately
  if (q.includes("youtube.com") || q.includes("youtu.be")) {
    switchSource('youtube');
    youtubeUrlInput.value = q;
    loadYouTubeVideo(q);
    return;
  }

  isSearchingYouTube = true;
  if (exploreLoadingSpinner) exploreLoadingSpinner.style.display = "block";
  if (exploreVideoGrid) exploreVideoGrid.innerHTML = "";

  try {
    const results = await api.searchYouTube(q, 16);
    if (!results || results.length === 0) {
      if (exploreVideoGrid) {
        exploreVideoGrid.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; color: var(--text-secondary); padding: 50px 0; font-size: 14px;">
            검색 결과가 없습니다. 다른 키워드로 검색해 보세요.
          </div>
        `;
      }
      return;
    }

    if (exploreVideoGrid) {
      exploreVideoGrid.innerHTML = "";
      results.forEach(item => {
        const card = document.createElement("div");
        card.className = "explore-video-card";
        card.innerHTML = `
          <div class="explore-card-thumb-wrap">
            <img class="explore-card-thumb" src="${item.thumbnail}" alt="${item.title}" loading="lazy">
            ${item.duration_str ? `<span class="explore-card-duration">${item.duration_str}</span>` : ''}
          </div>
          <div class="explore-card-body">
            <div class="explore-card-title" title="${item.title}">${item.title}</div>
            <div class="explore-card-channel">${item.channel}</div>
            <div class="explore-card-action">
              <span class="material-symbols-outlined" style="font-size: 14px;">bolt</span>
              <span>섀도잉 시작</span>
            </div>
          </div>
        `;

        card.addEventListener("click", () => {
          const videoUrl = `https://www.youtube.com/watch?v=${item.video_id}`;
          switchSource('youtube');
          youtubeUrlInput.value = videoUrl;
          loadYouTubeVideo(videoUrl);
        });

        exploreVideoGrid.appendChild(card);
      });
    }
  } catch (err) {
    console.error("Explore search failed:", err);
    if (exploreVideoGrid) {
      exploreVideoGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; color: var(--danger); padding: 50px 0; font-size: 14px;">
          검색 중 오류가 발생했습니다: ${err.message}
        </div>
      `;
    }
  } finally {
    isSearchingYouTube = false;
    if (exploreLoadingSpinner) exploreLoadingSpinner.style.display = "none";
  }
}

async function loadSubscriptionsBar() {
  if (!exploreSubChipsContainer) return;
  try {
    const data = await api.fetchUserSubscriptions();
    if (googleQuickStatusText) {
      googleQuickStatusText.textContent = data.authenticated ? "연동 완료" : "Google 연동";
    }

    const channels = data.channels || [];
    exploreSubChipsContainer.innerHTML = "";

    // "전체 피드" Chip
    const allChip = document.createElement("button");
    allChip.className = "explore-sub-chip active";
    allChip.dataset.channelId = "ALL";
    allChip.innerHTML = `<span class="material-symbols-outlined" style="font-size: 14px;">auto_awesome</span><span>추천 영어 구독 피드</span>`;
    allChip.addEventListener("click", () => {
      exploreSubChipsContainer.querySelectorAll(".explore-sub-chip").forEach(c => c.classList.remove("active"));
      allChip.classList.add("active");
      performExploreSearch("TED-Ed english");
    });
    exploreSubChipsContainer.appendChild(allChip);

    // Render individual channel chips
    channels.forEach(ch => {
      const chip = document.createElement("button");
      chip.className = "explore-sub-chip";
      chip.dataset.channelId = ch.channel_id;
      chip.dataset.channelTitle = ch.title;
      chip.innerHTML = `
        ${ch.thumbnail ? `<img src="${ch.thumbnail}" class="explore-sub-chip-thumb" alt="">` : ''}
        <span>${ch.title}</span>
      `;

      chip.addEventListener("click", () => {
        exploreSubChipsContainer.querySelectorAll(".explore-sub-chip").forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        loadChannelVideos(ch.channel_id, ch.title);
      });

      exploreSubChipsContainer.appendChild(chip);
    });
  } catch (err) {
    console.error("Failed to load subscriptions bar:", err);
  }
}

async function loadChannelVideos(channelId, channelTitle) {
  if (isSearchingYouTube) return;
  isSearchingYouTube = true;
  if (exploreLoadingSpinner) exploreLoadingSpinner.style.display = "block";
  if (exploreVideoGrid) exploreVideoGrid.innerHTML = "";

  try {
    const results = await api.fetchChannelVideos(channelId, channelTitle, 16);
    if (!results || results.length === 0) {
      if (exploreVideoGrid) {
        exploreVideoGrid.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; color: var(--text-secondary); padding: 50px 0; font-size: 14px;">
            '${channelTitle}' 채널의 영상을 불러오지 못했습니다.
          </div>
        `;
      }
      return;
    }

    if (exploreVideoGrid) {
      exploreVideoGrid.innerHTML = "";
      results.forEach(item => {
        const card = document.createElement("div");
        card.className = "explore-video-card";
        card.innerHTML = `
          <div class="explore-card-thumb-wrap">
            <img class="explore-card-thumb" src="${item.thumbnail}" alt="${item.title}" loading="lazy">
            ${item.duration_str ? `<span class="explore-card-duration">${item.duration_str}</span>` : ''}
          </div>
          <div class="explore-card-body">
            <div class="explore-card-title" title="${item.title}">${item.title}</div>
            <div class="explore-card-channel">${item.channel || channelTitle}</div>
            <div class="explore-card-action">
              <span class="material-symbols-outlined" style="font-size: 14px;">bolt</span>
              <span>섀도잉 시작</span>
            </div>
          </div>
        `;

        card.addEventListener("click", () => {
          const videoUrl = `https://www.youtube.com/watch?v=${item.video_id}`;
          switchSource('youtube');
          youtubeUrlInput.value = videoUrl;
          loadYouTubeVideo(videoUrl);
        });

        exploreVideoGrid.appendChild(card);
      });
    }
  } catch (err) {
    console.error("Failed to load channel videos:", err);
  } finally {
    isSearchingYouTube = false;
    if (exploreLoadingSpinner) exploreLoadingSpinner.style.display = "none";
  }
}

// ==========================================
// 6. Navigation Logic (Purely Time-Based)
// ==========================================

let seekLockUntil = 0;

function seekToSubtitle(index) {
  if (index < 0 || index >= state.subtitles.length) return;
  const sub = state.subtitles[index];
  
  state.currentSubtitleIndex = index;
  seekLockUntil = Date.now() + 800;
  player.seekTo(sub.start_ms + 20);
  state.hasPausedForShadowing = false;
  if (player.isPaused()) player.play();
  
  updateActiveSubtitleUI(index);
  
  if (state.dictationModeActive) {
    state.dictationChecked = false;
    const dictationInput = document.getElementById("dictation-input");
    if (dictationInput) dictationInput.value = "";
    updateDictationPanel();
  }
}

function playPreviousSubtitle() {
  if (state.subtitles.length === 0) return;
  const timeMs = player.getCurrentTimeMs();
  
  let targetIdx = -1;

  if (state.currentSubtitleIndex !== -1) {
    const curSub = state.subtitles[state.currentSubtitleIndex];
    // 문장 중간(1초 이상 진행)이면 현재 문장 처음으로, 아니면 이전 문장으로
    if (curSub && timeMs > curSub.start_ms + 1000) {
      targetIdx = state.currentSubtitleIndex;
    } else {
      targetIdx = state.currentSubtitleIndex - 1;
    }
  } else {
    // 갭(Gap) 구간일 경우: 현재 시간보다 앞에 있는 마지막 자막 찾기
    for (let i = state.subtitles.length - 1; i >= 0; i--) {
      if (state.subtitles[i].end_ms <= timeMs) {
        targetIdx = i;
        break;
      }
    }
  }

  // Dictation 모드 짧은 문장 스킵 처리 (위로 찾기)
  while (targetIdx >= 0 && state.dictationModeActive && isShortSubtitle(state.subtitles[targetIdx])) {
    targetIdx--;
  }
  
  if (targetIdx < 0) targetIdx = 0;
  seekToSubtitle(targetIdx);
}

function playNextSubtitle() {
  if (state.subtitles.length === 0) return;
  const timeMs = player.getCurrentTimeMs();
  
  let targetIdx = -1;

  if (state.currentSubtitleIndex !== -1) {
    // 현재 자막이 있다면 무조건 다음 자막
    targetIdx = state.currentSubtitleIndex + 1;
  } else {
    // 갭(Gap) 구간일 경우: 현재 시간보다 뒤에 있는 첫 번째 자막 찾기
    for (let i = 0; i < state.subtitles.length; i++) {
      if (state.subtitles[i].start_ms > timeMs) {
        targetIdx = i;
        break;
      }
    }
  }

  // Dictation 모드 짧은 문장 스킵 처리 (아래로 찾기)
  while (targetIdx >= 0 && targetIdx < state.subtitles.length && state.dictationModeActive && isShortSubtitle(state.subtitles[targetIdx])) {
    targetIdx++;
  }
  
  if (targetIdx >= state.subtitles.length || targetIdx < 0) {
    targetIdx = state.subtitles.length - 1;
  }
  
  seekToSubtitle(targetIdx);
}

function toggleABLoop() {
  state.abLoopActive = !state.abLoopActive;
  abLoopBtn.classList.toggle("active", state.abLoopActive);
}

// Expose for cross-module communication
window._seekToSubtitle = seekToSubtitle;
window._playNextSubtitle = playNextSubtitle;

// --- Video Event Handlers ---
player.onTimeUpdate((timeMs) => {
  if (Date.now() < seekLockUntil) return;

  let activeIdx = findActiveSubtitleIndex(timeMs);

  // A-B Loop Logic
  if (state.abLoopActive && state.currentSubtitleIndex !== -1) {
    const targetSub = state.subtitles[state.currentSubtitleIndex];
    if (targetSub) {
      if (timeMs >= targetSub.end_ms - 100 || timeMs < targetSub.start_ms - 300) {
        seekLockUntil = Date.now() + 400;
        player.seekTo(targetSub.start_ms + 10);
      }
      activeIdx = state.currentSubtitleIndex;
    }
  }

  // If subtitle changed
  if (activeIdx !== state.currentSubtitleIndex) {
    updateActiveSubtitleUI(activeIdx);
    
    // Save position
    if (state.currentEpisode) {
      saveLastWatched(state.currentEpisode.ep_key, timeMs, sourceMode);
    }
    
    if (activeIdx !== -1) {
      state.hasPausedForShadowing = false;
    }
    if (state.dictationModeActive) {
      state.dictationChecked = false;
      const dictationInput = document.getElementById("dictation-input");
      if (dictationInput) dictationInput.value = "";
      updateDictationPanel();
    }
  }

  // Auto-pause logic for Dictation mode
  if (!state.abLoopActive && state.dictationModeActive && state.currentSubtitleIndex !== -1 && !state.hasPausedForShadowing) {
    const activeSub = state.subtitles[state.currentSubtitleIndex];
    if (timeMs >= activeSub.end_ms - 150) {
      player.pause();
      state.hasPausedForShadowing = true;
    }
  }
});

player.onPlay();
player.onPause();

// --- Event Binding ---
function bindEvents() {
  episodeSelect.addEventListener("change", (e) => loadEpisode(e.target.value));
  
  document.getElementById("play-btn").addEventListener("click", () => player.togglePlay());
  document.getElementById("prev-btn").addEventListener("click", playPreviousSubtitle);
  document.getElementById("next-btn").addEventListener("click", playNextSubtitle);
  abLoopBtn.addEventListener("click", toggleABLoop);

  // Source Toggle
  sourceLocalBtn.addEventListener("click", () => switchSource('local'));
  sourceYoutubeBtn.addEventListener("click", () => switchSource('youtube'));
  if (sourceExploreBtn) {
    sourceExploreBtn.addEventListener("click", () => switchSource('explore'));
  }
  
  // YouTube Load
  youtubeLoadBtn.addEventListener("click", () => {
    const url = youtubeUrlInput.value.trim();
    if (!url) return;
    loadYouTubeVideo(url);
  });
  
  // YouTube URL paste — auto-load on Enter
  youtubeUrlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const url = youtubeUrlInput.value.trim();
      if (url) loadYouTubeVideo(url);
    }
  });
  
  // YouTube History select
  youtubeHistorySelect.addEventListener("change", (e) => {
    const videoId = e.target.value;
    if (!videoId) return;
    youtubeUrlInput.value = `https://www.youtube.com/watch?v=${videoId}`;
    loadYouTubeVideo(youtubeUrlInput.value);
    youtubeHistorySelect.value = "";
  });

  // YouTube Explore Search Events
  if (exploreSearchBtn) {
    exploreSearchBtn.addEventListener("click", () => {
      if (exploreSearchInput) performExploreSearch(exploreSearchInput.value);
    });
  }

  if (exploreSearchInput) {
    exploreSearchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        performExploreSearch(exploreSearchInput.value);
      }
    });
  }

  if (exploreTagsContainer) {
    exploreTagsContainer.addEventListener("click", (e) => {
      const chip = e.target.closest(".explore-tag-chip");
      if (!chip) return;
      exploreTagsContainer.querySelectorAll(".explore-tag-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      const query = chip.dataset.query;
      if (exploreSearchInput) exploreSearchInput.value = query;
      performExploreSearch(query);
    });
  }

  if (googleQuickConnectBtn) {
    googleQuickConnectBtn.addEventListener("click", openSettingsModal);
  }

  // Episode Complete logic
  if (episodeCompleteBtn) {
    episodeCompleteBtn.addEventListener("click", () => {
      const epKey = episodeSelect.value;
      if (!epKey) return;
      import('./state.js').then(module => {
        const isCompleted = module.toggleEpisodeCompletion(epKey);
        
        // Update button UI
        if (isCompleted) {
          episodeCompleteBtn.textContent = "완료됨 (취소)";
          episodeCompleteBtn.classList.add("completed");
        } else {
          episodeCompleteBtn.textContent = "완료 표시";
          episodeCompleteBtn.classList.remove("completed");
        }
        
        // Refresh episode list to update prefix
        fetchEpisodes().then(() => {
          episodeSelect.value = epKey; // Restore selection
        });
      });
    });
  }

  // Subtitle search
  subtitleSearchBtn.addEventListener("click", async () => {
    const epKey = episodeSelect.value;
    if (!epKey) return;
    
    const originalText = subtitleSearchBtn.innerHTML;
    subtitleSearchBtn.innerHTML = "검색 중...";
    subtitleSearchBtn.disabled = true;
    
    try {
      const data = await api.fetchSubtitlesOnline(epKey);
      if (data.success) {
        subtitleSearchBtn.innerHTML = "완료!";
        subtitleSearchBtn.style.color = "var(--success)";
        subtitleSearchBtn.style.borderColor = "var(--success)";
        
        loadEpisode(epKey);
        
        setTimeout(() => {
          subtitleSearchBtn.innerHTML = originalText;
          subtitleSearchBtn.style.color = "";
          subtitleSearchBtn.style.borderColor = "";
          subtitleSearchBtn.disabled = false;
        }, 2000);
        return;
      } else {
        subtitleSearchBtn.innerHTML = "검색 실패";
        setTimeout(() => {
          subtitleSearchBtn.innerHTML = originalText;
          subtitleSearchBtn.disabled = false;
        }, 3000);
        return;
      }
    } catch {
      subtitleSearchBtn.innerHTML = "오류 발생";
      setTimeout(() => {
        subtitleSearchBtn.innerHTML = originalText;
        subtitleSearchBtn.disabled = false;
      }, 3000);
      return;
    } 
    
    subtitleSearchBtn.innerHTML = originalText;
    subtitleSearchBtn.disabled = false;
  });
  
  // Launch / Connect Anki
  if (ankiStatusBtn) {
    ankiStatusBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!state.ankiConnected) {
        if (ankiStatusLabel) ankiStatusLabel.textContent = "실행 중...";
        await api.launchAnki();
        // Poll connection status
        for (let i = 0; i < 6; i++) {
          await new Promise(r => setTimeout(r, 1000));
          await checkAnkiStatus();
          if (state.ankiConnected) break;
        }
      } else {
        await checkAnkiStatus(true);
      }
    });
  }

  // Progress Bar Click & Drag
  let isDraggingProgress = false;
  const handleProgressSeek = (e) => {
    if (state.subtitles.length === 0) return;
    const rect = progressBarContainer.getBoundingClientRect();
    const clientX = e.touches?.length > 0 ? e.touches[0].clientX : e.clientX;
    let percentage = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    let targetIdx = Math.min(Math.floor(percentage * state.subtitles.length), state.subtitles.length - 1);
    
    // Using seekToSubtitle handles the seek lock automatically
    seekToSubtitle(targetIdx);
  };

  progressBarContainer.addEventListener("mousedown", (e) => { isDraggingProgress = true; handleProgressSeek(e); });
  progressBarContainer.addEventListener("touchstart", (e) => { isDraggingProgress = true; handleProgressSeek(e); }, {passive: true});
  document.addEventListener("mousemove", (e) => { if (isDraggingProgress) handleProgressSeek(e); });
  document.addEventListener("touchmove", (e) => { if (isDraggingProgress) handleProgressSeek(e); }, {passive: true});
  document.addEventListener("mouseup", () => { isDraggingProgress = false; });
  document.addEventListener("touchend", () => { isDraggingProgress = false; });

  // Shortcuts Modal
  const shortcutsBtn = document.getElementById("shortcuts-btn");
  const shortcutsModal = document.getElementById("shortcuts-modal");
  const shortcutsCloseBtn = document.getElementById("shortcuts-close-btn");
  const shortcutsConfirmBtn = document.getElementById("shortcuts-confirm-btn");

  const openShortcuts = () => {
    if (shortcutsModal) shortcutsModal.style.display = "flex";
  };
  const closeShortcuts = () => {
    if (shortcutsModal) shortcutsModal.style.display = "none";
  };

  if (shortcutsBtn) shortcutsBtn.addEventListener("click", openShortcuts);
  if (shortcutsCloseBtn) shortcutsCloseBtn.addEventListener("click", closeShortcuts);
  if (shortcutsConfirmBtn) shortcutsConfirmBtn.addEventListener("click", closeShortcuts);
  if (shortcutsModal) {
    shortcutsModal.addEventListener("click", (e) => {
      if (e.target === shortcutsModal) closeShortcuts();
    });
  }

  // Theater / Fullscreen Mode Toggle Button
  const theaterBtn = document.getElementById("theater-mode-btn");
  if (theaterBtn) {
    theaterBtn.addEventListener("click", toggleTheaterMode);
  }

  // Keyboard shortcuts
  document.addEventListener("keydown", handleKeyboardShortcuts);
  
  // Mode events (dictation, anki, etc.)
  bindModeEvents();
}

let theaterControlsTimer = null;

export function toggleTheaterMode() {
  const main = document.querySelector("main");
  if (!main) return;
  const isTheater = main.classList.toggle("theater-mode");
  const theaterIcon = document.getElementById("theater-icon");
  const theaterBtn = document.getElementById("theater-mode-btn");
  const playerControls = document.querySelector(".player-controls");

  if (theaterIcon) {
    theaterIcon.textContent = isTheater ? "fullscreen_exit" : "fullscreen";
  }
  if (theaterBtn) {
    theaterBtn.title = isTheater ? "기본 화면 / 사이드바 열기 (단축키: F)" : "전체화면 / 사이드바 접기 (단축키: F)";
    theaterBtn.classList.toggle("active", isTheater);
  }

  // Always keep controls hidden when toggling
  if (playerControls) {
    playerControls.classList.remove("visible");
  }
  clearTimeout(theaterControlsTimer);
}
window._toggleTheaterMode = toggleTheaterMode;

// Mouse move detection in theater mode to reveal controls ONLY when moving to the bottom edge
document.addEventListener("mousemove", (e) => {
  const main = document.querySelector("main");
  if (!main || !main.classList.contains("theater-mode")) return;

  const playerControls = document.querySelector(".player-controls");
  if (!playerControls) return;

  const windowHeight = window.innerHeight;
  // Trigger ONLY when mouse cursor is near the very bottom (bottom 90px) or directly on the controls
  if (e.clientY >= windowHeight - 90 || playerControls.contains(e.target)) {
    playerControls.classList.add("visible");
    clearTimeout(theaterControlsTimer);
  } else {
    clearTimeout(theaterControlsTimer);
    theaterControlsTimer = setTimeout(() => {
      playerControls.classList.remove("visible");
    }, 150);
  }
});

document.addEventListener("mouseleave", () => {
  const main = document.querySelector("main");
  if (!main || !main.classList.contains("theater-mode")) return;
  const playerControls = document.querySelector(".player-controls");
  if (playerControls) {
    playerControls.classList.remove("visible");
  }
});

function handleKeyboardShortcuts(e) {
  const activeEl = document.activeElement;
  if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || activeEl.tagName === "SELECT")) {
    if (activeEl.id === "youtube-url-input" && e.key === "Enter") {
      // YouTube URL input handles its own Enter key event, but we shouldn't block it here
      return;
    }
    if (activeEl.id === "dictation-input" && e.key === "Enter") {
      e.preventDefault();
      document.getElementById("dictation-check-btn").click();
    }
    return;
  }

  // If we are in dictation mode and the answer was checked, Enter should go to next subtitle
  if (state.dictationModeActive && state.dictationChecked && e.key === "Enter") {
    e.preventDefault();
    document.getElementById("dictation-check-btn").click();
    return;
  }

  const shortcutsModal = document.getElementById("shortcuts-modal");

  // Escape key closes modals or exits theater mode
  if (e.code === "Escape") {
    if (shortcutsModal && shortcutsModal.style.display === "flex") {
      shortcutsModal.style.display = "none";
      return;
    }
    const main = document.querySelector("main");
    if (main && main.classList.contains("theater-mode")) {
      toggleTheaterMode();
      return;
    }
  }

  // ? key toggles shortcuts modal
  if (e.key === "?" || (e.shiftKey && e.code === "Slash")) {
    e.preventDefault();
    if (shortcutsModal) {
      shortcutsModal.style.display = (shortcutsModal.style.display === "flex") ? "none" : "flex";
    }
    return;
  }

  // Korean layout shortcut for 'F' (ㄹ)
  if (e.key === "ㄹ" && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    toggleTheaterMode();
    return;
  }

  switch (e.code) {
    case "Space":
      e.preventDefault();
      player.togglePlay();
      break;
    case "ArrowLeft":
      e.preventDefault();
      playPreviousSubtitle();
      break;
    case "ArrowRight":
      e.preventDefault();
      playNextSubtitle();
      break;
    case "KeyR":
      toggleABLoop();
      break;
    case "KeyF":
      e.preventDefault();
      toggleTheaterMode();
      break;
    case "KeyA":
      const dictPopover = document.getElementById("dict-popover");
      if (dictPopover && dictPopover.style.display !== "none") {
        e.preventDefault();
        const dictAnkiBtn = document.getElementById("dict-anki-btn");
        if (dictAnkiBtn && !dictAnkiBtn.disabled) dictAnkiBtn.click();
        break;
      }
      if (state.currentSubtitleIndex !== -1) {
        e.preventDefault();
        toggleStar(state.currentSubtitleIndex);
      }
      break;
    case "Minus":
    case "NumpadSubtract":
      e.preventDefault();
      player.adjustSpeed(-0.1);
      break;
    case "Equal":
    case "NumpadAdd":
      e.preventDefault();
      player.adjustSpeed(0.1);
      break;
    case "BracketLeft":
      e.preventDefault();
      player.adjustSpeed(-0.1);
      break;
    case "BracketRight":
      e.preventDefault();
      player.adjustSpeed(0.1);
      break;
    case "KeyV":
      e.preventDefault();
      toggleBlur();
      break;
  }
}
