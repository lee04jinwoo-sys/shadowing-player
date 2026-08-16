// ====================================
// app.js — 앱 진입점 (초기화 + 이벤트 연결)
// ====================================

import state, { loadEpisodeState, saveStateToLocal, getGlobalExtracted, getGlobalCompletedEpisodes, addYouTubeToHistory, getYouTubeHistory } from './state.js';
import * as api from './api.js';
import * as player from './player.js';
import { renderSubtitles, updateActiveSubtitleUI, clearOverlays, findActiveSubtitleIndex, toggleStar, isShortSubtitle } from './subtitles.js';
import { setMode, bindModeEvents, updateDictationPanel, toggleListeningBlur } from './modes.js';

// --- DOM References ---
const episodeSelect = document.getElementById("episode-select");
const subtitleSearchBtn = document.getElementById("subtitle-search-btn");
const episodeCompleteBtn = document.getElementById("episode-complete-btn");
const ankiStatusDot = document.getElementById("anki-status-dot");
const progressBarContainer = document.getElementById("progress-bar-container");
const abLoopBtn = document.getElementById("ab-loop-btn");
const dictationInput = document.getElementById("dictation-input");

// YouTube DOM
const sourceLocalBtn = document.getElementById("source-local-btn");
const sourceYoutubeBtn = document.getElementById("source-youtube-btn");
const localControls = document.getElementById("local-controls");
const youtubeControls = document.getElementById("youtube-controls");
const youtubeUrlInput = document.getElementById("youtube-url-input");
const youtubeLoadBtn = document.getElementById("youtube-load-btn");
const youtubeHistorySelect = document.getElementById("youtube-history-select");

// --- Source Mode ---
let sourceMode = 'local'; // 'local' or 'youtube'

// --- Initialize ---
init();

async function init() {
  bindEvents();
  
  // Set initial mode to Listening mode (apply blur)
  const listeningBtn = document.getElementById("mode-listening");
  if (listeningBtn) setMode(listeningBtn);
  
  loadYouTubeHistory();
  fetchEpisodes();
  checkAnkiStatus();
  setInterval(checkAnkiStatus, 5000);
  
  // Load last watched state
  try {
    const m = await import('./state.js');
    const lastWatched = m.getLastWatched();
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
        }, 1000); // Give player time to initialize
      }
    }
  } catch (e) { console.error("Failed to restore last watched", e); }
}

// --- API Calls ---
async function fetchEpisodes() {
  try {
    state.episodes = await api.fetchEpisodeList();
    const globalExtracted = getGlobalExtracted();
    const globalCompleted = getGlobalCompletedEpisodes ? getGlobalCompletedEpisodes() : new Set();
    
    episodeSelect.innerHTML = '<option value="">에피소드를 선택하세요</option>';
    state.episodes.forEach(ep => {
      const option = document.createElement("option");
      option.value = ep.ep_key;
      const hasExtracted = globalExtracted[ep.ep_key] && globalExtracted[ep.ep_key].length > 0;
      const isCompleted = globalCompleted.has(ep.ep_key);
      
      let prefix = "";
      if (isCompleted) prefix += "✅ ";
      if (hasExtracted) prefix += "📝 ";
      
      option.textContent = `${prefix}${ep.ep_key.toUpperCase()} - ${ep.video_filename} (${ep.format.toUpperCase()})`;
      episodeSelect.appendChild(option);
    });
  } catch (err) {
    console.error("Failed to fetch episodes:", err);
    episodeSelect.innerHTML = '<option value="">에피소드 로드 실패</option>';
  }
}

async function checkAnkiStatus() {
  state.ankiConnected = await api.checkAnkiConnection();
  ankiStatusDot.classList.toggle("connected", state.ankiConnected);
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
      episodeCompleteBtn.textContent = "✅ 완료됨 (취소)";
      episodeCompleteBtn.classList.add("completed");
    } else {
      episodeCompleteBtn.textContent = "✅ 완료 표시";
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
  
  youtubeLoadBtn.innerHTML = "⏳ 로딩...";
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
    youtubeLoadBtn.innerHTML = "✅ 완료!";
    youtubeLoadBtn.style.color = "var(--success)";
    setTimeout(() => {
      youtubeLoadBtn.innerHTML = "▶️ 로드";
      youtubeLoadBtn.style.color = "";
      youtubeLoadBtn.disabled = false;
    }, 2000);
    
  } catch (err) {
    console.error("Failed to load YouTube video:", err);
    subtitleList.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--danger);">유튜브 로드 실패: ${err.message}</div>`;
    youtubeLoadBtn.innerHTML = "⚠️ 실패";
    setTimeout(() => {
      youtubeLoadBtn.innerHTML = "▶️ 로드";
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
    localControls.style.display = "flex";
    youtubeControls.style.display = "none";
  } else {
    sourceLocalBtn.classList.remove('active');
    sourceYoutubeBtn.classList.add('active');
    localControls.style.display = "none";
    youtubeControls.style.display = "flex";
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
    if (timeMs > curSub.start_ms + 1000) {
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
      import('./state.js').then(m => m.saveLastWatched(state.currentEpisode.ep_key, timeMs, sourceMode));
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

  // Episode Complete logic
  if (episodeCompleteBtn) {
    episodeCompleteBtn.addEventListener("click", () => {
      const epKey = episodeSelect.value;
      if (!epKey) return;
      import('./state.js').then(module => {
        const isCompleted = module.toggleEpisodeCompletion(epKey);
        
        // Update button UI
        if (isCompleted) {
          episodeCompleteBtn.textContent = "✅ 완료됨 (취소)";
          episodeCompleteBtn.classList.add("completed");
        } else {
          episodeCompleteBtn.textContent = "✅ 완료 표시";
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
    subtitleSearchBtn.innerHTML = "🔍 검색 중...";
    subtitleSearchBtn.disabled = true;
    
    try {
      const data = await api.fetchSubtitlesOnline(epKey);
      if (data.success) {
        subtitleSearchBtn.innerHTML = "✅ 완료!";
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
        subtitleSearchBtn.innerHTML = `⚠️ 검색 실패`;
        setTimeout(() => {
          subtitleSearchBtn.innerHTML = originalText;
          subtitleSearchBtn.disabled = false;
        }, 3000);
        return;
      }
    } catch {
      subtitleSearchBtn.innerHTML = `⚠️ 오류 발생`;
      setTimeout(() => {
        subtitleSearchBtn.innerHTML = originalText;
        subtitleSearchBtn.disabled = false;
      }, 3000);
      return;
    } 
    
    subtitleSearchBtn.innerHTML = originalText;
    subtitleSearchBtn.disabled = false;
  });
  
  // Launch Anki
  document.getElementById("anki-status-btn").addEventListener("click", () => {
    api.launchAnki();
  });

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

  // Keyboard shortcuts
  document.addEventListener("keydown", handleKeyboardShortcuts);
  
  // Mode events (dictation, anki, etc.)
  bindModeEvents();
}

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
    case "KeyA":
      if (state.currentSubtitleIndex !== -1) {
        e.preventDefault();
        toggleStar(state.currentSubtitleIndex);
      }
      break;
    case "KeyV":
      e.preventDefault();
      toggleListeningBlur();
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
  }
}
