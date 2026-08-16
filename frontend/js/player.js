// ====================================
// player.js — 영상 재생 제어 (Player Adapter 패턴)
// ====================================
// HTML5 <video> 와 YouTube IFrame Player를 통합 인터페이스로 제공

import state from './state.js?v=20260816_2105';

// --- DOM References ---
const videoElement = document.getElementById("video-element");
const youtubeContainer = document.getElementById("youtube-player");
const playIcon = document.getElementById("play-icon");
const pauseIcon = document.getElementById("pause-icon");
const speedSlider = document.getElementById("speed-slider");
const speedIndicator = document.getElementById("speed-indicator");
const noVideoMsg = document.getElementById("no-video-msg");

// --- Active adapter tracking ---
let activeAdapter = 'html5'; // 'html5' or 'youtube'
let ytPlayer = null;
let ytTimeUpdateInterval = null;
let ytTimeUpdateCallbacks = [];
let ytPlayCallback = null;
let ytPauseCallback = null;
let ytReady = false;

// =====================
// HTML5 Adapter (로컬 영상)
// =====================
function html5SetSource(epKey) {
  switchToHTML5();
  videoElement.src = `/api/video/${epKey}`;
  videoElement.load();
  videoElement.style.display = "block";
  if (noVideoMsg) noVideoMsg.style.display = "none";
  const warnBox = document.getElementById("avi-warning");
  if (warnBox) warnBox.remove();
}

// =====================
// YouTube Adapter
// =====================
function youtubeSetSource(videoId) {
  switchToYouTube();
  
  if (ytPlayer && ytReady) {
    ytPlayer.loadVideoById(videoId);
  } else {
    // Create new player
    createYouTubePlayer(videoId);
  }
}

function createYouTubePlayer(videoId) {
  if (typeof YT === 'undefined' || !YT.Player) {
    console.warn("YouTube IFrame API not ready yet. Retrying in 100ms...");
    setTimeout(() => createYouTubePlayer(videoId), 100);
    return;
  }

  if (ytPlayer) {
    try {
      ytPlayer.destroy();
    } catch (e) {
      console.warn("Error destroying previous YT player instance:", e);
    }
    ytPlayer = null;
  }
  
  // Clear container
  youtubeContainer.innerHTML = '';
  
  const playerDiv = document.createElement('div');
  playerDiv.id = 'yt-iframe-target';
  youtubeContainer.appendChild(playerDiv);
  
  ytReady = false;
  ytPlayer = new YT.Player('yt-iframe-target', {
    videoId: videoId,
    width: '100%',
    height: '100%',
    playerVars: {
      autoplay: 0,
      controls: 1,
      modestbranding: 1,
      rel: 0,
      iv_load_policy: 3,  // hide annotations
      cc_load_policy: 0,  // hide CC (we render our own)
      playsinline: 1,
    },
    events: {
      onReady: (e) => {
        ytReady = true;
        e.target.setPlaybackRate(state.playbackSpeed);
      },
      onStateChange: (e) => {
        if (e.data === YT.PlayerState.PLAYING) {
          state.hasPausedForShadowing = false;
          playIcon.style.display = "none";
          pauseIcon.style.display = "block";
          startYTTimePolling();
          if (ytPlayCallback) ytPlayCallback();
        } else if (e.data === YT.PlayerState.PAUSED) {
          playIcon.style.display = "block";
          pauseIcon.style.display = "none";
          stopYTTimePolling();
          if (ytPauseCallback) ytPauseCallback();
        } else if (e.data === YT.PlayerState.ENDED) {
          playIcon.style.display = "block";
          pauseIcon.style.display = "none";
          stopYTTimePolling();
        }
      },
    }
  });
}

function startYTTimePolling() {
  stopYTTimePolling();
  ytTimeUpdateInterval = setInterval(() => {
    if (ytPlayer && ytReady && ytPlayer.getCurrentTime) {
      const timeMs = ytPlayer.getCurrentTime() * 1000;
      ytTimeUpdateCallbacks.forEach(cb => cb(timeMs));
    }
  }, 100); // 100ms polling for smooth subtitle sync
}

function stopYTTimePolling() {
  if (ytTimeUpdateInterval) {
    clearInterval(ytTimeUpdateInterval);
    ytTimeUpdateInterval = null;
  }
}

function switchToHTML5() {
  activeAdapter = 'html5';
  stopYTTimePolling();
  if (ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
    try { ytPlayer.pauseVideo(); } catch (e) {}
  }
  videoElement.style.display = "block";
  youtubeContainer.style.display = "none";
}

function switchToYouTube() {
  activeAdapter = 'youtube';
  videoElement.style.display = "none";
  videoElement.pause();
  videoElement.removeAttribute('src');
  youtubeContainer.style.display = "block";
  if (noVideoMsg) noVideoMsg.style.display = "none";
  const warnBox = document.getElementById("avi-warning");
  if (warnBox) warnBox.remove();
}

// =====================
// Unified Public API
// =====================
export function setSource(epKey) {
  html5SetSource(epKey);
}

export function setYouTubeSource(videoId) {
  youtubeSetSource(videoId);
}

export function showAviWarning() {
  videoElement.style.display = "none";
  let warnBox = document.getElementById("avi-warning");
  if (!warnBox) {
    warnBox = document.createElement("div");
    warnBox.id = "avi-warning";
    warnBox.style.cssText = "color: #ef4444; padding: 24px; text-align: center; font-size: 16px; font-weight: 600;";
    warnBox.innerHTML = `
      ⚠️ 재생 불가능한 파일 형식 (.avi)<br><br>
      <span style="font-size: 14px; color: #94a3b8; font-weight: normal;">
        HTML5 비디오는 .avi 재생을 지원하지 않습니다.<br>
        프로젝트 폴더 내 <code>convert_avi_to_mp4.py</code>를 실행하여 변환해 주세요.
      </span>
    `;
    videoElement.parentNode.appendChild(warnBox);
  }
}

export function getCurrentTimeMs() {
  if (activeAdapter === 'youtube' && ytPlayer && ytReady) {
    return ytPlayer.getCurrentTime() * 1000;
  }
  return videoElement.currentTime * 1000;
}

export function seekTo(ms) {
  if (activeAdapter === 'youtube' && ytPlayer && ytReady) {
    ytPlayer.seekTo(ms / 1000, true);
  } else {
    videoElement.currentTime = ms / 1000;
  }
}

export function play() {
  if (activeAdapter === 'youtube' && ytPlayer && ytReady) {
    ytPlayer.playVideo();
  } else {
    if (videoElement.src) videoElement.play();
  }
}

export function pause() {
  if (activeAdapter === 'youtube' && ytPlayer && ytReady) {
    ytPlayer.pauseVideo();
  } else {
    videoElement.pause();
  }
}

export function togglePlay() {
  if (activeAdapter === 'youtube' && ytPlayer && ytReady) {
    const ytState = ytPlayer.getPlayerState();
    if (ytState === YT.PlayerState.PLAYING) {
      ytPlayer.pauseVideo();
    } else {
      ytPlayer.playVideo();
    }
  } else {
    if (!videoElement.src) return;
    videoElement.paused ? videoElement.play() : videoElement.pause();
  }
}

export function isPaused() {
  if (activeAdapter === 'youtube' && ytPlayer && ytReady) {
    return ytPlayer.getPlayerState() !== YT.PlayerState.PLAYING;
  }
  return videoElement.paused;
}

export function adjustSpeed(delta) {
  state.playbackSpeed = Math.min(Math.max(Math.round((state.playbackSpeed + delta) * 10) / 10, 0.5), 2.0);
  if (activeAdapter === 'youtube' && ytPlayer && ytReady) {
    ytPlayer.setPlaybackRate(state.playbackSpeed);
  } else {
    videoElement.playbackRate = state.playbackSpeed;
  }
  speedIndicator.textContent = state.playbackSpeed.toFixed(1) + "x";
  if (speedSlider) speedSlider.value = state.playbackSpeed;
}

export function setSpeed(speed) {
  state.playbackSpeed = speed;
  if (activeAdapter === 'youtube' && ytPlayer && ytReady) {
    ytPlayer.setPlaybackRate(speed);
  } else {
    videoElement.playbackRate = speed;
  }
  speedIndicator.textContent = speed.toFixed(1) + "x";
}

// --- Event Binding ---
export function onTimeUpdate(callback) {
  // HTML5 events
  videoElement.addEventListener("timeupdate", () => {
    if (activeAdapter === 'html5') {
      callback(getCurrentTimeMs());
    }
  });
  // YouTube polling callbacks
  ytTimeUpdateCallbacks.push(callback);
}

export function onPlay(callback) {
  videoElement.addEventListener("play", () => {
    if (activeAdapter === 'html5') {
      state.hasPausedForShadowing = false;
      playIcon.style.display = "none";
      pauseIcon.style.display = "block";
      if (callback) callback();
    }
  });
  ytPlayCallback = callback;
}

export function onPause(callback) {
  videoElement.addEventListener("pause", () => {
    if (activeAdapter === 'html5') {
      playIcon.style.display = "block";
      pauseIcon.style.display = "none";
      if (callback) callback();
    }
  });
  ytPauseCallback = callback;
}

export function getActiveAdapter() {
  return activeAdapter;
}

// Speed slider binding
if (speedSlider) {
  speedSlider.addEventListener("input", (e) => {
    setSpeed(parseFloat(e.target.value));
  });
}
