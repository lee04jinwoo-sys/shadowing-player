// ====================================
// subtitles.js — 자막 렌더링 & 동기화
// ====================================

import state, { saveStateToLocal, getSavedVocab } from './state.js';

// --- DOM References ---
const subtitleList = document.getElementById("subtitle-list");
const overlayEn = document.getElementById("overlay-en");
const overlayKr = document.getElementById("overlay-kr");
const progressText = document.getElementById("progress-text");
const progressBarFill = document.getElementById("progress-bar-fill");

// --- Helper: Get Saved Vocab Words & Phrases (Split by extracted / pending) ---
export function getSavedWordsData() {
  const list = getSavedVocab ? getSavedVocab() : [];
  const extractedWords = new Set();
  const starredWords = new Set();
  const extractedPhrases = [];
  const starredPhrases = [];

  list.forEach(item => {
    if (item && item.word) {
      const clean = item.word.toLowerCase().replace(/^[^\w\s'-]+|[^\w\s'-]+$/g, "").trim();
      if (clean) {
        if (item.extracted) {
          if (clean.includes(" ")) extractedPhrases.push(clean);
          else extractedWords.add(clean);
        } else {
          if (clean.includes(" ")) starredPhrases.push(clean);
          else starredWords.add(clean);
        }
      }
    }
  });
  return { extractedWords, starredWords, extractedPhrases, starredPhrases };
}

// --- Tokenize Words for Interactive Dictionary & Saved Word Highlighting ---
export function formatEnglishWords(text) {
  if (!text) return "";
  const { extractedWords, starredWords, extractedPhrases, starredPhrases } = getSavedWordsData();
  const lowerText = text.toLowerCase();
  
  // Check multi-word phrase matching
  const matchedExtractedPhrases = extractedPhrases.filter(p => lowerText.includes(p));
  const matchedStarredPhrases = starredPhrases.filter(p => lowerText.includes(p));

  const clean = text.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
  return clean.split(/(\s+|[^\w\s'-]+)/).map(token => {
    const trimmed = token.trim();
    const isWord = /^[a-zA-Z0-9'-]+$/.test(trimmed);
    if (isWord && trimmed.length > 0) {
      const lowerTrimmed = trimmed.toLowerCase();
      
      // 1. Extracted in Anki (Green) takes highest priority
      let isExtracted = extractedWords.has(lowerTrimmed);
      if (!isExtracted && matchedExtractedPhrases.length > 0) {
        isExtracted = matchedExtractedPhrases.some(p => p.split(/\s+/).includes(lowerTrimmed));
      }

      if (isExtracted) {
        return `<span class="word-token word-extracted" data-word="${trimmed}">${token}</span>`;
      }

      // 2. Starred / Pending in Queue (Yellow)
      let isStarred = starredWords.has(lowerTrimmed);
      if (!isStarred && matchedStarredPhrases.length > 0) {
        isStarred = matchedStarredPhrases.some(p => p.split(/\s+/).includes(lowerTrimmed));
      }

      if (isStarred) {
        return `<span class="word-token word-saved" data-word="${trimmed}">${token}</span>`;
      }

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
    const isStarred = state.starredSubtitles.has(idx);

    // Green border for extracted, Yellow border for starred
    if (isExtracted) {
      item.style.borderLeft = "3px solid #22c55e";
    } else if (isStarred) {
      item.style.borderLeft = "3px solid #fbbf24";
    } else {
      item.style.borderLeft = "1px solid transparent";
    }

    item.innerHTML = `
      <div class="time-tag">${timeStr}</div>
      <div class="text-en">${formatEnglishWords(sub.text_en)}</div>
      ${sub.text_kr ? `<div class="text-kr">${sub.text_kr}</div>` : ''}
    `;

    item.addEventListener("click", (e) => {
      // 1. If user was dragging / selecting text, let mouseup handle it
      const sel = window.getSelection();
      if (sel && sel.toString().trim().length > 0) {
        return;
      }

      // 2. Word Token Click (with Shift+Click multi-word range selection)
      if (e.target && e.target.classList.contains("word-token")) {
        e.stopPropagation();
        const currentToken = e.target;
        const currentWord = currentToken.getAttribute("data-word") || currentToken.textContent.trim();

        if (e.shiftKey && window._lastClickedToken && window._lastClickedToken.subIdx === idx && window._lastClickedToken.el !== currentToken) {
          // Range selection between lastClickedToken and currentToken
          const allTokens = Array.from(item.querySelectorAll(".word-token"));
          const idxA = allTokens.indexOf(window._lastClickedToken.el);
          const idxB = allTokens.indexOf(currentToken);

          if (idxA !== -1 && idxB !== -1) {
            const start = Math.min(idxA, idxB);
            const end = Math.max(idxA, idxB);
            const selectedTokens = allTokens.slice(start, end + 1);

            // Clear previous token highlights and highlight range
            document.querySelectorAll(".word-token.token-selected").forEach(el => el.classList.remove("token-selected"));
            selectedTokens.forEach(t => t.classList.add("token-selected"));

            const phrase = selectedTokens.map(t => t.textContent).join(" ").trim();
            const rangeRect = getElementsBoundingRect(selectedTokens);

            if (phrase && window._showWordDictionary) {
              window._showWordDictionary(phrase, sub.text_en, null, rangeRect);
            }
            window._lastClickedToken = { el: currentToken, word: currentWord, subIdx: idx };
            return;
          }
        }

        // Single word click
        window._lastClickedToken = { el: currentToken, word: currentWord, subIdx: idx };
        if (currentWord && window._showWordDictionary) {
          window._showWordDictionary(currentWord, sub.text_en, currentToken);
        }
        return;
      }

      // 3. Seek to subtitle
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
        dictationStarBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 15px; vertical-align: middle;">star</span> 보관됨 (A)';
      } else {
        dictationStarBtn.style.background = "transparent";
        dictationStarBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 15px; vertical-align: middle;">star</span> 보관 (A)';
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

function getElementsBoundingRect(elements) {
  if (!elements || elements.length === 0) return null;
  let minLeft = Infinity, minTop = Infinity, maxRight = -Infinity, maxBottom = -Infinity;
  elements.forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.left < minLeft) minLeft = r.left;
    if (r.top < minTop) minTop = r.top;
    if (r.right > maxRight) maxRight = r.right;
    if (r.bottom > maxBottom) maxBottom = r.bottom;
  });
  return {
    left: minLeft,
    top: minTop,
    right: maxRight,
    bottom: maxBottom,
    width: maxRight - minLeft,
    height: maxBottom - minTop
  };
}
