// ====================================
// state.js — 앱 상태 관리 (중앙 집중)
// ====================================

// --- Persistent State (localStorage) ---
let globalStarred = {};
let globalEdits = {};
let globalExtracted = {};
let globalCompletedEpisodes = new Set();

try {
  const savedCompleted = localStorage.getItem('shadowing_completed_eps');
  if (savedCompleted) {
    globalCompletedEpisodes = new Set(JSON.parse(savedCompleted));
  }
  const savedStars = localStorage.getItem('shadowing_starred');
  if (savedStars) {
    const parsed = JSON.parse(savedStars);
    if (!Array.isArray(parsed)) globalStarred = parsed;
  }
  
  const savedEdits = localStorage.getItem('shadowing_edits');
  if (savedEdits) {
    const parsed = JSON.parse(savedEdits);
    const keys = Object.keys(parsed);
    if (keys.length > 0 && isNaN(parseInt(keys[0]))) {
      globalEdits = parsed;
    }
  }
  
  const savedExtracted = localStorage.getItem('shadowing_extracted');
  if (savedExtracted) {
    globalExtracted = JSON.parse(savedExtracted);
  }
} catch (e) {
  console.error("Failed to load saved state", e);
}

// --- Runtime State ---
const state = {
  episodes: [],
  currentEpisode: null,
  subtitles: [],
  
  // Per-episode state (loaded when episode changes)
  starredSubtitles: new Set(),
  editedStarredText: {},
  extractedSubtitles: new Set(),
  
  // Player state
  currentSubtitleIndex: -1,
  abLoopActive: false,
  playbackSpeed: 1.0,
  showEnSub: true,
  showKrSub: true,
  hasPausedForShadowing: false,
  lastValidProgressIdx: 0,
  
  // Mode state
  shadowingModeActive: true,
  dictationModeActive: false,
  dictationChecked: false,
  
  // Anki
  ankiConnected: false,
};

export default state;

// --- State Persistence ---
export function saveStateToLocal() {
  if (!state.currentEpisode) return;
  try {
    const epKey = state.currentEpisode.ep_key;
    globalStarred[epKey] = Array.from(state.starredSubtitles);
    globalEdits[epKey] = state.editedStarredText;
    globalExtracted[epKey] = Array.from(state.extractedSubtitles);
    
    localStorage.setItem('shadowing_starred', JSON.stringify(globalStarred));
    localStorage.setItem('shadowing_edits', JSON.stringify(globalEdits));
    localStorage.setItem('shadowing_extracted', JSON.stringify(globalExtracted));
  } catch (e) {
    console.error("Failed to save state", e);
  }
}

export function loadEpisodeState(epKey) {
  state.starredSubtitles = new Set(globalStarred[epKey] || []);
  state.editedStarredText = globalEdits[epKey] || {};
  state.extractedSubtitles = new Set(globalExtracted[epKey] || []);
}

export function getGlobalExtracted() {
  return globalExtracted;
}

export function getGlobalCompletedEpisodes() {
  return globalCompletedEpisodes;
}

export function toggleEpisodeCompletion(epKey) {
  if (globalCompletedEpisodes.has(epKey)) {
    globalCompletedEpisodes.delete(epKey);
  } else {
    globalCompletedEpisodes.add(epKey);
  }
  localStorage.setItem('shadowing_completed_eps', JSON.stringify(Array.from(globalCompletedEpisodes)));
  return globalCompletedEpisodes.has(epKey);
}

// --- YouTube History ---
let youtubeHistory = [];
try {
  const saved = localStorage.getItem('shadowing_youtube_history');
  if (saved) youtubeHistory = JSON.parse(saved);
} catch (e) { /* ignore */ }

export function addYouTubeToHistory(videoId, title) {
  // Remove if already exists
  youtubeHistory = youtubeHistory.filter(v => v.id !== videoId);
  // Add to front
  youtubeHistory.unshift({ id: videoId, title, addedAt: Date.now() });
  // Keep max 20
  if (youtubeHistory.length > 20) youtubeHistory.length = 20;
  localStorage.setItem('shadowing_youtube_history', JSON.stringify(youtubeHistory));
}

export function getYouTubeHistory() {
  return youtubeHistory;
}

// --- Last Watched State ---
export function saveLastWatched(epKey, timeMs, sourceMode) {
  try {
    localStorage.setItem('shadowing_last_watched', JSON.stringify({
      epKey, timeMs, sourceMode
    }));
  } catch(e) {}
}

export function getLastWatched() {
  try {
    const saved = localStorage.getItem('shadowing_last_watched');
    return saved ? JSON.parse(saved) : null;
  } catch(e) {
    return null;
  }
}
