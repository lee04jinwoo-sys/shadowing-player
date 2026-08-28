// ====================================
// dict.js — 인터랙티브 단어 팝업 사전 & Anki 단어 연동
// ====================================

import { lookupWord } from "./api.js";
import { saveVocabItem, getSavedVocab } from "./state.js";

let popoverEl = null;
let currentWordData = null;

export function initDictionary() {
  createPopoverDOM();
  bindGlobalEvents();
}

function createPopoverDOM() {
  if (document.getElementById("dict-popover")) return;

  popoverEl = document.createElement("div");
  popoverEl.id = "dict-popover";
  popoverEl.className = "dict-popover";
  popoverEl.style.display = "none";

  popoverEl.innerHTML = `
    <div class="dict-header">
      <div class="dict-word-group">
        <span class="dict-word dict-editable" id="dict-word-text" contenteditable="true" spellcheck="false" title="클릭하여 단어/숙어 표기 수정"></span>
        <button class="dict-audio-btn" id="dict-audio-btn" title="발음 듣기">
          <span class="material-symbols-outlined">volume_up</span>
        </button>
        <span class="dict-phonetic dict-editable" id="dict-phonetic-text" contenteditable="true" spellcheck="false" title="클릭하여 발음기호 수정"></span>
      </div>
      <span class="dict-pos-badge dict-editable" id="dict-pos-badge" contenteditable="true" spellcheck="false" title="클릭하여 품사 수정"></span>
    </div>
    
    <div class="dict-body">
      <div class="dict-loading" id="dict-loading">
        <div class="spinner-mini"></div> <span style="font-size: 11px; color: var(--text-muted);">단어 분석 중...</span>
      </div>
      
      <div class="dict-content" id="dict-content" style="display: none;">
        <div class="dict-meaning-row">
          <span class="dict-meaning-label">뜻</span>
          <span class="dict-meaning dict-editable" id="dict-meaning-text" contenteditable="true" spellcheck="false" title="클릭하여 뜻 수정"></span>
        </div>

        <div class="dict-phrase-row" id="dict-phrase-row" style="display: none;">
          <span class="dict-phrase-label">문맥 표현</span>
          <button class="dict-phrase-chip" id="dict-phrase-chip" title="이 숙어/표현 전체 분석하기"></button>
        </div>
        
        <div class="dict-explanation-row" id="dict-explanation-row">
          <span class="dict-explanation-label">뉘앙스</span>
          <span class="dict-explanation dict-editable" id="dict-explanation-text" contenteditable="true" spellcheck="false" title="클릭하여 뉘앙스/설명 수정"></span>
        </div>

        <div class="dict-synonyms-row" id="dict-synonyms-row">
          <span class="dict-synonyms-label">유의어</span>
          <span class="dict-synonyms dict-editable" id="dict-synonyms-text" contenteditable="true" spellcheck="false" title="클릭하여 유의어 수정"></span>
        </div>

        <div class="dict-example-row" id="dict-example-row">
          <span class="dict-example-label">예문</span>
          <span class="dict-example dict-editable" id="dict-example-text" contenteditable="true" spellcheck="false" title="클릭하여 예문 수정"></span>
        </div>
      </div>
    </div>

    <div class="dict-footer">
      <button class="btn primary dict-anki-btn" id="dict-anki-btn">
        <span class="material-symbols-outlined" style="font-size: 14px;">star</span>
        <span id="dict-btn-text">보관</span>
      </button>
    </div>
  `;

  document.body.appendChild(popoverEl);

  // Audio Play
  document.getElementById("dict-audio-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    const wordEl = document.getElementById("dict-word-text");
    const word = wordEl ? wordEl.textContent.trim() : (currentWordData?.word || "");
    if (word) playWordPronunciation(word);
  });

  // Queue Save (보관)
  document.getElementById("dict-anki-btn").addEventListener("click", async (e) => {
    e.stopPropagation();
    await saveWordToQueue();
  });
}

function clearSelectedTokens() {
  document.querySelectorAll(".word-token.token-selected").forEach(el => {
    el.classList.remove("token-selected");
  });
}

function highlightRangeTokens(range) {
  clearSelectedTokens();
  if (!range) return;
  const container = range.commonAncestorContainer;
  const root = container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement;
  if (!root) return;
  
  const subItem = root.closest(".subtitle-item") || document.getElementById("overlay-en");
  if (!subItem) return;
  const tokens = subItem.querySelectorAll(".word-token");
  tokens.forEach(token => {
    if (range.intersectsNode(token)) {
      token.classList.add("token-selected");
    }
  });
}

function bindGlobalEvents() {
  // 1. Text drag / selection lookup for multi-word expressions
  document.addEventListener("mouseup", (e) => {
    if (popoverEl && popoverEl.contains(e.target)) return;
    
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    if (selectedText && selectedText.length >= 2) {
      const targetContainer = e.target.closest(".subtitle-item") || e.target.closest("#overlay-en") || e.target.closest(".text-en");
      if (targetContainer) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const subItem = e.target.closest(".subtitle-item");
          let context = selectedText;
          if (subItem) {
            const enEl = subItem.querySelector(".text-en");
            if (enEl) context = enEl.textContent;
          }
          showWordDictionary(selectedText, context, null, rect, range);
          // Clear native selection so only our clean styled underline is shown!
          setTimeout(() => {
            window.getSelection().removeAllRanges();
          }, 50);
        }
      }
    }
  });

  // 2. Click outside to close
  document.addEventListener("click", (e) => {
    if (!popoverEl || popoverEl.style.display === "none") return;
    if (popoverEl.contains(e.target) || e.target.classList.contains("word-token")) return;
    hidePopover();
  });

  // 3. ESC to close
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && popoverEl && popoverEl.style.display !== "none") {
      hidePopover();
    }
  });
}

let currentContext = "";

export async function showWordDictionary(word, context, targetElement, customRect = null, range = null) {
  if (!popoverEl) initDictionary();

  const cleanWord = word.replace(/^[^a-zA-Z0-9'-]+|[^a-zA-Z0-9'-]+$/g, "").trim();
  if (!cleanWord || cleanWord.length < 2) return;

  clearSelectedTokens();
  if (targetElement && targetElement.classList.contains("word-token")) {
    targetElement.classList.add("token-selected");
  } else if (range) {
    highlightRangeTokens(range);
  }

  currentWordData = null;
  currentContext = context || cleanWord;

  // Set initial UI
  document.getElementById("dict-word-text").textContent = cleanWord;
  document.getElementById("dict-phonetic-text").textContent = "";
  document.getElementById("dict-pos-badge").textContent = "";
  document.getElementById("dict-pos-badge").className = "dict-pos-badge";
  document.getElementById("dict-loading").style.display = "flex";
  document.getElementById("dict-content").style.display = "none";
  document.getElementById("dict-phrase-row").style.display = "none";

  const ankiBtn = document.getElementById("dict-anki-btn");
  ankiBtn.disabled = false;
  ankiBtn.innerHTML = "<span class=\"material-symbols-outlined\" style=\"font-size: 14px;\">add</span> Anki 단어/표현장에 추가";
  ankiBtn.style.backgroundColor = "";
  ankiBtn.style.color = "";

  // Position Popover
  positionPopover(targetElement, customRect);

  popoverEl.style.display = "block";

  try {
    const data = await lookupWord(cleanWord, currentContext);
    currentWordData = data;
    renderWordDetails(data);
  } catch (err) {
    document.getElementById("dict-loading").style.display = "none";
    document.getElementById("dict-content").style.display = "block";
    document.getElementById("dict-meaning-text").textContent = "단어/표현 정보를 불러오지 못했습니다.";
  }
}

function renderWordDetails(data) {
  document.getElementById("dict-loading").style.display = "none";
  document.getElementById("dict-content").style.display = "block";

  document.getElementById("dict-word-text").textContent = data.word || data.lemma || "";
  document.getElementById("dict-phonetic-text").textContent = (data.phonetic && data.phonetic !== "-") ? data.phonetic : "";
  
  const posBadge = document.getElementById("dict-pos-badge");
  if (data.pos) {
    posBadge.textContent = data.pos.toUpperCase();
    posBadge.className = `dict-pos-badge pos-${data.pos.toLowerCase()}`;
    posBadge.style.display = "inline-block";
  } else {
    posBadge.style.display = "none";
  }

  document.getElementById("dict-meaning-text").textContent = data.meaning || "";

  // Related Phrase Chip
  const phraseRow = document.getElementById("dict-phrase-row");
  const phraseChip = document.getElementById("dict-phrase-chip");
  if (data.related_phrase && data.related_phrase.phrase && data.related_phrase.phrase.toLowerCase() !== (data.word || "").toLowerCase()) {
    phraseChip.textContent = `${data.related_phrase.phrase} (${data.related_phrase.meaning || ""})`;
    phraseChip.onclick = (e) => {
      e.stopPropagation();
      showWordDictionary(data.related_phrase.phrase, currentContext, null, popoverEl.getBoundingClientRect());
    };
    phraseRow.style.display = "flex";
  } else {
    phraseRow.style.display = "none";
  }

  const expRow = document.getElementById("dict-explanation-row");
  if (data.explanation) {
    document.getElementById("dict-explanation-text").textContent = data.explanation;
    expRow.style.display = "flex";
  } else {
    expRow.style.display = "none";
  }

  const synRow = document.getElementById("dict-synonyms-row");
  if (data.synonyms && data.synonyms.length > 0) {
    const synList = Array.isArray(data.synonyms) ? data.synonyms.join(", ") : data.synonyms;
    document.getElementById("dict-synonyms-text").textContent = synList;
    synRow.style.display = "flex";
  } else {
    synRow.style.display = "none";
  }

  const exRow = document.getElementById("dict-example-row");
  if (data.example) {
    document.getElementById("dict-example-text").textContent = data.example;
    exRow.style.display = "flex";
  } else {
    exRow.style.display = "none";
  }

  // Update button state if already saved in queue
  const cleanWord = (data.word || data.lemma || "").trim();
  const savedList = getSavedVocab();
  const isSaved = savedList.some(v => v.word.toLowerCase() === cleanWord.toLowerCase());

  const ankiBtn = document.getElementById("dict-anki-btn");
  const btnText = document.getElementById("dict-btn-text");
  if (ankiBtn) {
    ankiBtn.disabled = false;
    if (isSaved) {
      ankiBtn.style.backgroundColor = "var(--bg-tertiary)";
      ankiBtn.style.borderColor = "var(--border)";
      if (btnText) btnText.textContent = "보관됨 (다시 보관)";
    } else {
      ankiBtn.style.backgroundColor = "";
      ankiBtn.style.borderColor = "";
      if (btnText) btnText.textContent = "보관";
    }
  }
}

function positionPopover(targetElement, customRect = null) {
  const rect = customRect || (targetElement ? targetElement.getBoundingClientRect() : { left: window.innerWidth / 2, top: window.innerHeight / 2, width: 0, height: 0, bottom: window.innerHeight / 2 });
  const popoverWidth = 330;
  const popoverHeight = 250;

  let left = rect.left + (rect.width / 2) - (popoverWidth / 2);
  let top = rect.bottom + 8; // default below target

  // Viewport bounds detection
  if (left < 10) left = 10;
  if (left + popoverWidth > window.innerWidth - 10) {
    left = window.innerWidth - popoverWidth - 10;
  }

  // If bottom exceeds viewport, place above
  if (top + popoverHeight > window.innerHeight - 10) {
    top = Math.max(10, rect.top - popoverHeight - 8);
  }

  popoverEl.style.left = `${Math.max(10, left)}px`;
  popoverEl.style.top = `${Math.max(10, top)}px`;
}

export function hidePopover() {
  clearSelectedTokens();
  if (popoverEl) {
    popoverEl.style.display = "none";
  }
}

function playWordPronunciation(word) {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = "en-US";
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  }
}

async function saveWordToQueue() {
  const wordEl = document.getElementById("dict-word-text");
  const meaningEl = document.getElementById("dict-meaning-text");
  const posEl = document.getElementById("dict-pos-badge");
  const synonymsEl = document.getElementById("dict-synonyms-text");
  const exampleEl = document.getElementById("dict-example-text");
  const explanationEl = document.getElementById("dict-explanation-text");

  const wordVal = wordEl ? wordEl.textContent.trim() : (currentWordData?.word || "");
  const meaningVal = meaningEl ? meaningEl.textContent.trim() : (currentWordData?.meaning || "");
  const posVal = posEl ? posEl.textContent.trim().toLowerCase() : (currentWordData?.pos || "");
  const synonymsVal = synonymsEl ? synonymsEl.textContent.trim() : (currentWordData?.synonyms || "");
  const exampleVal = exampleEl ? exampleEl.textContent.trim() : (currentWordData?.example || "");
  const explanationVal = explanationEl ? explanationEl.textContent.trim() : (currentWordData?.explanation || "");

  if (!wordVal) return;

  const ankiBtn = document.getElementById("dict-anki-btn");
  const btnText = document.getElementById("dict-btn-text");

  const payload = {
    word: wordVal,
    meaning: meaningVal,
    pos: posVal,
    synonyms: synonymsVal,
    example: exampleVal,
    explanation: explanationVal,
    extracted: false
  };

  // Save to local storage queue
  saveVocabItem(payload);

  if (btnText) btnText.textContent = "보관 완료!";
  ankiBtn.style.backgroundColor = "var(--success)";
  ankiBtn.style.borderColor = "var(--success)";

  // Update Anki extraction panel if open
  if (window._renderStarredList) window._renderStarredList();
  if (window._updateStarredCounts) window._updateStarredCounts();

  showDictToast(`'${wordVal}' 단어가 추출 대기열에 보관되었습니다.`);

  setTimeout(() => {
    if (btnText) btnText.textContent = "보관됨";
    ankiBtn.style.backgroundColor = "var(--bg-tertiary)";
    ankiBtn.style.borderColor = "var(--border)";
  }, 1500);
}

function showDictToast(msg) {
  let toast = document.getElementById("dict-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "dict-toast";
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: #1e1b4b;
      color: #fff;
      padding: 10px 18px;
      border-radius: 8px;
      border: 1px solid #6366f1;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
      font-size: 13px;
      font-weight: 500;
      z-index: 99999;
      display: flex;
      align-items: center;
      gap: 8px;
      pointer-events: none;
      animation: fadeIn 0.2s ease;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.display = "flex";

  setTimeout(() => {
    if (toast) toast.style.display = "none";
  }, 2500);
}
