// ====================================
// subtitles.js — 자막 렌더링 & 동기화
// ====================================

import state, { saveStateToLocal } from './state.js?v=20260816_2105';

// --- DOM References ---
const subtitleList = document.getElementById("subtitle-list");
const overlayEn = document.getElementById("overlay-en");
const overlayKr = document.getElementById("overlay-kr");
const progressText = document.getElementById("progress-text");
const progressBarFill = document.getElementById("progress-bar-fill");

// --- Tokenize Words for Interactive Dictionary ---
export function formatEnglishWords(text) {
  if (!text) return "";
  return text.split(/(\s+|[^\w\s'-]+)/).map(token => {
    const trimmed = token.trim();
    const isWord = /^[a-zA-Z0-9'-]+$/.test(trimmed);
    if (isWord && trimmed.length > 0) {
      return `<span class="word-token" data-word="${trimmed}">${token}</span>`;
    }
    return token;
  }).join("");
}

// --- Render Subtitle List ---
export function renderSubtitles() {
  subtitleList.innerHTML = "";
  if (state.subtitles.length === 0) {
    subtitleList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">자막이 없습니다.</div>';
    return;
  }

  state.subtitles.forEach((sub, idx) => {
    const item = document.createElement("div");
    item.className = "subtitle-item";
    item.id = `sub-item-${idx}`;
    item.dataset.index = idx;

    const minutes = Math.floor(sub.start_ms / 60000);
    const seconds = Math.floor((sub.start_ms % 60000) / 1000);
    const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    const isExtracted = state.extractedSubtitles.has(idx);
    const extractedBadge = isExtracted ? `<span style="font-size: 10px; margin-left: 6px;" title="Anki로 추출됨">✅</span>` : '';

    const isStarred = state.starredSubtitles.has(idx);
    item.style.borderLeft = isStarred ? "3px solid #fbbf24" : "1px solid transparent";

    item.innerHTML = `
      <div class="time-tag">${timeStr}${extractedBadge}</div>
      <div class="text-en">${formatEnglishWords(sub.text_en)}</div>
      ${sub.text_kr ? `<div class="text-kr">${sub.text_kr}</div>` : ''}
    `;

    item.addEventListener("click", (e) => {
      if (e.target && e.target.classList.contains("word-token")) {
        e.stopPropagation();
        const word = e.target.getAttribute("data-word");
        if (word && window._showWordDictionary) {
          window._showWordDictionary(word, sub.text_en, e.target);
        }
        return;
      }
      if (window._seekToSubtitle) window._seekToSubtitle(idx);
    });

    subtitleList.appendChild(item);
  });
  
  updateSubVisibility();
}

// --- Update Active Subtitle UI ---
export function updateActiveSubtitleUI(index) {
  const prevActive = subtitleList.querySelector(".subtitle-item.active");
  if (prevActive) prevActive.classList.remove("active");

  state.currentSubtitleIndex = index;
  
  // Update Progress Bar
  if (state.subtitles.length > 0) {
    if (index !== -1) state.lastValidProgressIdx = index + 1;
    const progressIdx = state.lastValidProgressIdx || (index === -1 ? 0 : index + 1);
    const percentage = Math.round((progressIdx / state.subtitles.length) * 100);
    progressText.textContent = `${progressIdx} / ${state.subtitles.length} (${percentage}%)`;
    progressBarFill.style.width = `${percentage}%`;
  }

  if (index === -1) {
    clearOverlays();
    return;
  }

  const sub = state.subtitles[index];
  
  // Highlight & auto-scroll
  const activeItem = document.getElementById(`sub-item-${index}`);
  if (activeItem) {
    activeItem.classList.add("active");
    
    // Direct container scrollTop positioning to avoid browser smooth-scroll animation queue lag
    const container = subtitleList;
    if (container) {
      const itemTop = activeItem.offsetTop;
      const itemHeight = activeItem.offsetHeight;
      const containerHeight = container.clientHeight;
      const targetScroll = itemTop - (containerHeight / 2) + (itemHeight / 2);
      
      // Auto (instant) for high speed, smooth for normal speed
      const behavior = state.playbackSpeed > 1.2 ? "auto" : "smooth";
      container.scrollTo({ top: Math.max(0, targetScroll), behavior: behavior });
    }
  }

  // Update video overlays
  if (state.showEnSub && sub.text_en && !state.dictationModeActive) {
    overlayEn.innerHTML = formatEnglishWords(sub.text_en);
    overlayEn.style.display = "inline-block";
  } else {
    overlayEn.style.display = "none";
  }

  if (state.showKrSub && sub.text_kr) {
    overlayKr.textContent = sub.text_kr;
    overlayKr.style.display = "inline-block";
  } else {
    overlayKr.style.display = "none";
  }

  // Update Star Button
  updateStarUI(index);
}

export function clearOverlays() {
  overlayEn.style.display = "none";
  overlayKr.style.display = "none";
}

export function updateSubVisibility() {
  const isListening = document.body.classList.contains("mode-listening");
  document.querySelectorAll(".text-en").forEach(el => el.style.display = (state.showEnSub || isListening) ? "block" : "none");
  document.querySelectorAll(".text-kr").forEach(el => el.style.display = (state.showKrSub || isListening) ? "block" : "none");
}

// --- Find Active Subtitle by Time ---
export function findActiveSubtitleIndex(timeMs) {
  let low = 0;
  let high = state.subtitles.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const sub = state.subtitles[mid];

    if (timeMs >= sub.start_ms && timeMs < sub.end_ms) {
      return mid;
    } else if (timeMs < sub.start_ms) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  // Fallback for exactly matching end_ms boundary
  if (low > 0 && timeMs === state.subtitles[low - 1].end_ms) {
    return low - 1;
  }
  
  return -1;
}

// --- Star/Bookmark Management ---
export function toggleStar(index) {
  if (state.starredSubtitles.has(index)) {
    state.starredSubtitles.delete(index);
  } else {
    state.starredSubtitles.add(index);
  }
  updateStarUI(index);
  saveStateToLocal();
  import('./modes.js').then(m => m.renderStarredList());
}

export function updateStarUI(index) {
  const dictationStarBtn = document.getElementById("dictation-star-btn");
  
  if (state.currentSubtitleIndex === index) {
    const isStarred = state.starredSubtitles.has(index);
    
    if (dictationStarBtn) {
      if (isStarred) {
        dictationStarBtn.style.background = "rgba(251, 191, 36, 0.2)";
        dictationStarBtn.innerHTML = "🌟 보관됨 (A)";
      } else {
        dictationStarBtn.style.background = "transparent";
        dictationStarBtn.innerHTML = "⭐ 보관 (A)";
      }
    }
  }
  
  // Update subtitle list item border
  const listItems = subtitleList.querySelectorAll('.subtitle-item');
  if (listItems[index]) {
    listItems[index].style.borderLeft = state.starredSubtitles.has(index) 
      ? "3px solid #fbbf24" 
      : "1px solid transparent";
  }
}

// --- Utility ---
export function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function isShortSubtitle(sub) {
  if (!sub || !sub.text_en) return true;
  const wordCount = sub.text_en.trim().split(/\s+/).filter(w => w.length > 0).length;
  return wordCount < 3;
}
