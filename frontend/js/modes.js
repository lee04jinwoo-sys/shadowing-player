import state, { saveStateToLocal, getSavedVocab, updateSavedVocabItem, deleteSavedVocabItem } from './state.js';
import { renderSubtitles, updateActiveSubtitleUI, updateSubVisibility, toggleStar, formatTime } from './subtitles.js';
import { addSentenceToAnki, bulkAddSentencesToAnki, bulkAddVocabToAnki, addVocabCardToAnki, getAIExplanation } from './api.js';

// --- DOM References ---
const modeListening = document.getElementById("mode-listening");
const modeDictation = document.getElementById("mode-dictation");
const modeAnki = document.getElementById("mode-anki");

const contentSubs = document.getElementById("content-subs");
const contentDictation = document.getElementById("content-dictation");
const ankiExtractionPanel = document.getElementById("anki-extraction-panel");

const dictationInput = document.getElementById("dictation-input");
const dictationCheckBtn = document.getElementById("dictation-check-btn");
const dictationResultCard = document.getElementById("dictation-result-card");
const dictationResultBox = document.getElementById("dictation-result-box");
const dictationTranslation = document.getElementById("dictation-translation");

// Extraction Sub-Tabs & Containers
let currentExtTab = 'sentences'; // 'sentences' | 'words'
const starredSentencesContainer = document.getElementById("starred-sentences-container");
const starredWordsContainer = document.getElementById("starred-words-container");
const starredSentenceCount = document.getElementById("starred-sentence-count");
const starredWordCount = document.getElementById("starred-word-count");

const extTabSentences = document.getElementById("ext-tab-sentences");
const extTabWords = document.getElementById("ext-tab-words");
const sentenceActions = document.getElementById("sentence-actions");
const vocabActions = document.getElementById("vocab-actions");

const ankiBulkExportBtn = document.getElementById("anki-bulk-export-btn");
const ankiBulkVocabExportBtn = document.getElementById("anki-bulk-vocab-export-btn");
const bulkExportProgress = document.getElementById("bulk-export-progress");
const bulkExportStatus = document.getElementById("bulk-export-status");

// --- Mode Switching ---
const modes = [modeListening, modeDictation, modeAnki].filter(Boolean);

export function setMode(modeBtn) {
  const listeningBtn = document.getElementById("mode-listening");
  const dictationBtn = document.getElementById("mode-dictation");
  const ankiBtn = document.getElementById("mode-anki");
  const allModes = [listeningBtn, dictationBtn, ankiBtn].filter(Boolean);

  allModes.forEach(btn => btn.classList.remove("active"));
  if (modeBtn) modeBtn.classList.add("active");

  const contentSubs = document.getElementById("content-subs");
  const contentDictation = document.getElementById("content-dictation");
  const ankiExtractionPanel = document.getElementById("anki-extraction-panel");

  if (contentSubs) contentSubs.style.display = "flex";
  if (contentDictation) contentDictation.style.display = "none";
  if (ankiExtractionPanel) ankiExtractionPanel.style.display = "none";

  state.shadowingModeActive = false;
  state.dictationModeActive = (modeBtn === dictationBtn);
  if (modeBtn === listeningBtn) {
    document.body.classList.add("mode-listening");
    state.showEnSub = false; state.showKrSub = false;
  } else if (modeBtn === dictationBtn) {
    if (contentSubs) contentSubs.style.display = "none";
    if (contentDictation) contentDictation.style.display = "flex";
    state.dictationChecked = false;
    if (!state.abLoopActive) {
      const abBtn = document.getElementById("ab-loop-btn");
      if (abBtn) abBtn.click();
    }
    updateDictationPanel();
    const dInput = document.getElementById("dictation-input");
    if (dInput) setTimeout(() => dInput.focus(), 100);
  } else if (modeBtn === ankiBtn) {
    if (contentSubs) contentSubs.style.display = "none";
    if (contentDictation) contentDictation.style.display = "none";
    if (ankiExtractionPanel) ankiExtractionPanel.style.display = "flex";
    state.showEnSub = true; state.showKrSub = true;
    renderStarredList();
  }
  
  updateSubVisibility();
  updateActiveSubtitleUI(state.currentSubtitleIndex);
  if (state.dictationModeActive) {
    updateDictationPanel();
  }
}

export function bindModeEvents() {
  const listeningBtn = document.getElementById("mode-listening");
  const dictationBtn = document.getElementById("mode-dictation");
  const ankiBtn = document.getElementById("mode-anki");

  if (listeningBtn) {
    listeningBtn.onclick = (e) => { e.preventDefault(); setMode(listeningBtn); };
  }
  if (dictationBtn) {
    dictationBtn.onclick = (e) => { e.preventDefault(); setMode(dictationBtn); };
  }
  if (ankiBtn) {
    ankiBtn.onclick = (e) => { e.preventDefault(); setMode(ankiBtn); };
  }
  
  // Dictation events
  dictationCheckBtn.addEventListener("click", () => {
    if (!state.dictationChecked) {
      checkDictationAnswer();
    } else {
      state.dictationChecked = false;
      dictationInput.value = "";
      if (window._playNextSubtitle) window._playNextSubtitle();
      setTimeout(() => dictationInput.focus(), 50);
    }
  });

  const dictationReplayBtn = document.getElementById("dictation-replay-btn");
  if (dictationReplayBtn) {
    dictationReplayBtn.addEventListener("click", () => {
      if (state.currentSubtitleIndex !== -1 && window._seekToSubtitle) {
        window._seekToSubtitle(state.currentSubtitleIndex);
      }
    });
  }

  const dictationStarBtn = document.getElementById("dictation-star-btn");
  if (dictationStarBtn) {
    dictationStarBtn.addEventListener("click", () => {
      if (state.currentSubtitleIndex !== -1) toggleStar(state.currentSubtitleIndex);
    });
  }

  // AI Explain
  const aiExplainBtn = document.getElementById("ai-explain-btn");
  const aiExplanationContainer = document.getElementById("ai-explanation-container");
  const aiLoadingSpinner = document.getElementById("ai-loading-spinner");
  const aiExplanationBox = document.getElementById("ai-explanation-box");

  if (aiExplainBtn) {
    aiExplainBtn.addEventListener("click", async () => {
      if (state.currentSubtitleIndex === -1) return;
      const sub = state.subtitles[state.currentSubtitleIndex];
      if (!sub || !sub.text_en) return;

      aiExplanationContainer.style.display = "block";
      aiLoadingSpinner.style.display = "inline-block";
      aiExplanationBox.textContent = "AI가 문장을 분석하고 있습니다...";
      aiExplainBtn.disabled = true;

      try {
        const data = await getAIExplanation(sub.text_en);
        if (data.success && data.explanation) {
          aiExplanationBox.innerHTML = data.explanation
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>');
        } else {
          aiExplanationBox.textContent = data.error || "AI 응답을 가져오는 데 실패했습니다.";
        }
      } catch {
        aiExplanationBox.textContent = "AI 응답을 가져오는 데 실패했습니다.";
      } finally {
        aiLoadingSpinner.style.display = "none";
        aiExplainBtn.disabled = false;
      }
    });
  }

  // Extraction Sub-Tabs & Actions
  if (extTabSentences) {
    extTabSentences.addEventListener("click", () => switchExtractionTab('sentences'));
  }
  if (extTabWords) {
    extTabWords.addEventListener("click", () => switchExtractionTab('words'));
  }
  if (ankiBulkExportBtn) {
    ankiBulkExportBtn.addEventListener("click", bulkExportToAnki);
  }
  if (ankiBulkVocabExportBtn) {
    ankiBulkVocabExportBtn.addEventListener("click", bulkExportVocabToAnki);
  }

  const exportApkgBtn = document.getElementById("export-apkg-btn");
  const exportCsvBtn = document.getElementById("export-csv-btn");
  const exportVocabApkgBtn = document.getElementById("export-vocab-apkg-btn");
  const exportVocabCsvBtn = document.getElementById("export-vocab-csv-btn");

  if (exportApkgBtn) {
    exportApkgBtn.addEventListener("click", async () => {
      const items = getStarredItemsData();
      if (items.length === 0) return;
      const originalText = exportApkgBtn.innerHTML;
      exportApkgBtn.disabled = true;
      exportApkgBtn.textContent = "생성 중...";
      try {
        const { exportApkg } = await import('./api.js');
        await exportApkg(items, "Shadowing Sentence Deck");
      } catch (err) {
        alert("APKG 내보내기 실패: " + err.message);
      } finally {
        exportApkgBtn.disabled = false;
        exportApkgBtn.innerHTML = originalText;
      }
    });
  }

  if (exportCsvBtn) {
    exportCsvBtn.addEventListener("click", async () => {
      const items = getStarredItemsData();
      if (items.length === 0) return;
      const originalText = exportCsvBtn.innerHTML;
      exportCsvBtn.disabled = true;
      exportCsvBtn.textContent = "생성 중...";
      try {
        const { exportCsv } = await import('./api.js');
        await exportCsv(items, "Shadowing Sentence Deck");
      } catch (err) {
        alert("CSV 내보내기 실패: " + err.message);
      } finally {
        exportCsvBtn.disabled = false;
        exportCsvBtn.innerHTML = originalText;
      }
    });
  }

  if (exportVocabApkgBtn) {
    exportVocabApkgBtn.addEventListener("click", async () => {
      const items = getSavedVocabItemsData();
      if (items.length === 0) return;
      const originalText = exportVocabApkgBtn.innerHTML;
      exportVocabApkgBtn.disabled = true;
      exportVocabApkgBtn.textContent = "생성 중...";
      try {
        const { exportApkg } = await import('./api.js');
        await exportApkg(items, "Shadowing Vocabulary Deck");
      } catch (err) {
        alert("단어 APKG 내보내기 실패: " + err.message);
      } finally {
        exportVocabApkgBtn.disabled = false;
        exportVocabApkgBtn.innerHTML = originalText;
      }
    });
  }

  if (exportVocabCsvBtn) {
    exportVocabCsvBtn.addEventListener("click", async () => {
      const items = getSavedVocabItemsData();
      if (items.length === 0) return;
      const originalText = exportVocabCsvBtn.innerHTML;
      exportVocabCsvBtn.disabled = true;
      exportVocabCsvBtn.textContent = "생성 중...";
      try {
        const { exportCsv } = await import('./api.js');
        await exportCsv(items, "Shadowing Vocabulary Deck");
      } catch (err) {
        alert("단어 CSV 내보내기 실패: " + err.message);
      } finally {
        exportVocabCsvBtn.disabled = false;
        exportVocabCsvBtn.innerHTML = originalText;
      }
    });
  }

  // STT Speech Recognition Mic Button
  const sttMicBtn = document.getElementById("stt-mic-btn");
  const sttMicLabel = document.getElementById("stt-mic-label");

  if (sttMicBtn) {
    sttMicBtn.addEventListener("click", async () => {
      const { startSTT, stopSTT, getSTTListeningState, isSTTSupported } = await import('./stt.js');

      if (!isSTTSupported()) {
        alert("현재 브라우저는 음성 인식을 지원하지 않습니다. Chrome, Edge, Safari를 사용해주세요!");
        return;
      }

      if (getSTTListeningState()) {
        stopSTT();
        sttMicBtn.style.background = "rgba(239, 68, 68, 0.1)";
        sttMicBtn.style.color = "#f87171";
        if (sttMicLabel) sttMicLabel.textContent = "음성 채점";
        return;
      }

      // Pause video when recording voice
      import('./player.js').then(m => m.pause());

      sttMicBtn.style.background = "rgba(239, 68, 68, 0.3)";
      sttMicBtn.style.color = "#ffffff";
      if (sttMicLabel) sttMicLabel.textContent = "듣는 중...";

      startSTT(
        (interimText) => {
          dictationInput.value = interimText;
        },
        (finalText) => {
          dictationInput.value = finalText;
          sttMicBtn.style.background = "rgba(239, 68, 68, 0.1)";
          sttMicBtn.style.color = "#f87171";
          if (sttMicLabel) sttMicLabel.textContent = "음성 채점";
          checkDictationAnswer();
        },
        (errMessage) => {
          alert(errMessage);
          sttMicBtn.style.background = "rgba(239, 68, 68, 0.1)";
          sttMicBtn.style.color = "#f87171";
          if (sttMicLabel) sttMicLabel.textContent = "음성 채점";
        },
        () => {
          sttMicBtn.style.background = "rgba(239, 68, 68, 0.1)";
          sttMicBtn.style.color = "#f87171";
          if (sttMicLabel) sttMicLabel.textContent = "음성 채점";
        }
      );
    });
  }

  // Toggle Blur Button in Subtitle Header
  const toggleBlurBtn = document.getElementById("toggle-blur-btn");
  if (toggleBlurBtn) {
    toggleBlurBtn.addEventListener("click", () => {
      toggleBlur();
    });
  }
}

export function toggleBlur() {
  const isRevealed = document.body.classList.toggle("blur-revealed");
  const blurBtn = document.getElementById("toggle-blur-btn");
  const blurIcon = document.getElementById("blur-icon");
  const blurLabel = document.getElementById("blur-btn-text");

  if (isRevealed) {
    if (blurIcon) blurIcon.textContent = "visibility";
    if (blurLabel) blurLabel.textContent = "자막 보임 (V)";
    if (blurBtn) blurBtn.classList.add("active");
  } else {
    if (blurIcon) blurIcon.textContent = "visibility_off";
    if (blurLabel) blurLabel.textContent = "자막 숨김 (V)";
    if (blurBtn) blurBtn.classList.remove("active");
  }
}

// --- Dictation Logic ---
export function updateDictationPanel() {
  if (state.currentSubtitleIndex === -1) {
    dictationInput.disabled = true;
    dictationInput.value = "";
    dictationCheckBtn.disabled = true;
    dictationResultCard.style.display = "none";
    return;
  }

  const sub = state.subtitles[state.currentSubtitleIndex];

  if (!state.dictationChecked) {
    dictationInput.disabled = false;
    dictationCheckBtn.disabled = false;
    dictationCheckBtn.textContent = "정답 확인";
    dictationResultCard.style.display = "none";
    
    const aiExplanationContainer = document.getElementById("ai-explanation-container");
    if (aiExplanationContainer) aiExplanationContainer.style.display = "none";
    const aiExplainBtn = document.getElementById("ai-explain-btn");
    if (aiExplainBtn) aiExplainBtn.disabled = false;
    const sttScoreBadge = document.getElementById("stt-score-badge");
    if (sttScoreBadge) sttScoreBadge.style.display = "none";
  } else {
    dictationInput.disabled = true;
    dictationCheckBtn.disabled = false;
    dictationCheckBtn.textContent = "다음 대사 (Enter)";
    dictationResultCard.style.display = "block";
    if (sub.text_kr) {
      dictationTranslation.textContent = sub.text_kr;
      dictationTranslation.parentElement.style.display = "block";
    } else {
      dictationTranslation.parentElement.style.display = "none";
    }
  }
}

function checkDictationAnswer() {
  if (state.currentSubtitleIndex === -1) return;
  const sub = state.subtitles[state.currentSubtitleIndex];
  const typed = dictationInput.value.trim();

  const comparison = compareStrings(sub.text_en, typed);
  
  dictationResultBox.innerHTML = comparison.map(item => {
    if (item.status === "correct") return `<span class="word-correct">${item.word}</span>`;
    if (item.status === "wrong") return `<span class="word-wrong" title="입력값: ${item.typed}">${item.word}</span>`;
    if (item.status === "missing") return `<span class="word-missing" title="놓친 단어">${item.word}</span>`;
    if (item.status === "extra") return `<span class="word-extra" title="추가된 단어">${item.word}</span>`;
    return item.word;
  }).join(" ");

  // STT Score Calculation
  const sttScoreBadge = document.getElementById("stt-score-badge");
  if (sttScoreBadge && typed) {
    const correctCount = comparison.filter(item => item.status === "correct").length;
    const totalWords = comparison.filter(item => item.status !== "extra").length;
    const score = totalWords > 0 ? Math.round((correctCount / totalWords) * 100) : 0;
    
    sttScoreBadge.style.display = "flex";
    sttScoreBadge.style.alignItems = "center";
    sttScoreBadge.style.justifyContent = "center";
    sttScoreBadge.style.gap = "8px";

    let color = "#f87171";
    let bg = "rgba(239, 68, 68, 0.1)";
    let border = "rgba(239, 68, 68, 0.25)";

    if (score >= 90) {
      color = "#34d399";
      bg = "rgba(52, 211, 153, 0.1)";
      border = "rgba(52, 211, 153, 0.25)";
    } else if (score >= 70) {
      color = "#818cf8";
      bg = "rgba(129, 140, 248, 0.1)";
      border = "rgba(129, 140, 248, 0.25)";
    } else if (score >= 50) {
      color = "#fbbf24";
      bg = "rgba(251, 191, 36, 0.1)";
      border = "rgba(251, 191, 36, 0.25)";
    }
    
    sttScoreBadge.style.background = bg;
    sttScoreBadge.style.border = `1px solid ${border}`;
    sttScoreBadge.innerHTML = `
      <span style="font-size: 12px; font-weight: 500; color: var(--text-muted);">일치율</span>
      <span style="font-size: 24px; font-weight: 800; font-family: var(--font-mono); color: ${color}; line-height: 1;">${score}%</span>
    `;
  } else if (sttScoreBadge) {
    sttScoreBadge.style.display = "none";
  }

  state.dictationChecked = true;
  updateDictationPanel();
}

export function compareStrings(correct, typed) {
  const normalize = (str) => str.toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "")
    .replace(/\s+/g, " ").trim().split(" ").filter(Boolean);

  const correctWords = normalize(correct);
  const typedWords = normalize(typed);

  let correctIdx = 0, typedIdx = 0;
  const result = [];

  while (correctIdx < correctWords.length || typedIdx < typedWords.length) {
    if (correctIdx < correctWords.length && typedIdx < typedWords.length) {
      if (correctWords[correctIdx] === typedWords[typedIdx]) {
        result.push({ word: correctWords[correctIdx], status: "correct" });
        correctIdx++; typedIdx++;
      } else {
        const lookAheadIdx = correctWords.slice(correctIdx).indexOf(typedWords[typedIdx]);
        if (lookAheadIdx !== -1) {
          for (let k = 0; k < lookAheadIdx; k++) {
            result.push({ word: correctWords[correctIdx + k], status: "missing" });
          }
          correctIdx += lookAheadIdx;
        } else {
          result.push({ word: correctWords[correctIdx], status: "wrong", typed: typedWords[typedIdx] });
          correctIdx++; typedIdx++;
        }
      }
    } else if (correctIdx < correctWords.length) {
      result.push({ word: correctWords[correctIdx], status: "missing" });
      correctIdx++;
    } else {
      result.push({ word: typedWords[typedIdx], status: "extra" });
      typedIdx++;
    }
  }
  return result;
}

// --- Extraction Panel (Sentences & Vocab Sub-Tabs) ---

export function updateStarredCounts() {
  const sentenceCount = state.starredSubtitles.size;
  const allVocab = getSavedVocab ? getSavedVocab() : [];
  const pendingVocab = allVocab.filter(v => !v.extracted);
  const wordCount = pendingVocab.length;

  if (starredSentenceCount) starredSentenceCount.textContent = sentenceCount;
  if (starredWordCount) starredWordCount.textContent = wordCount;

  // Toggle empty states for action buttons
  if (ankiBulkExportBtn) ankiBulkExportBtn.disabled = (sentenceCount === 0);
  if (ankiBulkVocabExportBtn) ankiBulkVocabExportBtn.disabled = (wordCount === 0);
}
window._updateStarredCounts = updateStarredCounts;

export function switchExtractionTab(tab) {
  currentExtTab = tab;
  if (extTabSentences) extTabSentences.classList.toggle("active", tab === 'sentences');
  if (extTabWords) extTabWords.classList.toggle("active", tab === 'words');

  if (starredSentencesContainer) starredSentencesContainer.style.display = (tab === 'sentences') ? 'flex' : 'none';
  if (starredWordsContainer) starredWordsContainer.style.display = (tab === 'words') ? 'flex' : 'none';

  if (sentenceActions) sentenceActions.style.display = (tab === 'sentences') ? 'flex' : 'none';
  if (vocabActions) vocabActions.style.display = (tab === 'words') ? 'flex' : 'none';

  renderStarredList();
}

export function renderStarredList() {
  updateStarredCounts();

  // Save current textarea values before re-rendering
  if (starredSentencesContainer) {
    starredSentencesContainer.querySelectorAll('.starred-sentence-input').forEach(input => {
      const idx = parseInt(input.getAttribute('data-idx'));
      if (!isNaN(idx)) state.editedStarredText[idx] = input.value;
    });
    starredSentencesContainer.querySelectorAll('.starred-translation-input').forEach(input => {
      const idx = parseInt(input.getAttribute('data-idx'));
      if (!isNaN(idx)) state.editedStarredTranslation[idx] = input.value;
    });
  }

  renderSentencesList();
  renderVocabList();
}
window._renderStarredList = renderStarredList;

function renderSentencesList() {
  if (!starredSentencesContainer) return;
  starredSentencesContainer.innerHTML = "";

  const exportApkgBtn = document.getElementById("export-apkg-btn");
  const exportCsvBtn = document.getElementById("export-csv-btn");

  if (state.starredSubtitles.size === 0) {
    starredSentencesContainer.innerHTML = `
      <div style="text-align: center; color: var(--text-secondary); margin-top: 40px; font-size: 13px; line-height: 1.6;">
        보관된 문장이 없습니다.<br>
        자막 목록 또는 맞추기 모드에서 <strong>'보관 (A)'</strong> 버튼을 눌러 문장을 모아보세요.
      </div>
    `;
    if (exportApkgBtn) exportApkgBtn.disabled = true;
    if (exportCsvBtn) exportCsvBtn.disabled = true;
    return;
  }

  if (exportApkgBtn) exportApkgBtn.disabled = false;
  if (exportCsvBtn) exportCsvBtn.disabled = false;

  const sortedIndices = Array.from(state.starredSubtitles).sort((a, b) => a - b);
  sortedIndices.forEach((idx) => {
    const sub = state.subtitles[idx] || {};
    const customText = state.editedStarredText[idx] !== undefined 
      ? state.editedStarredText[idx] 
      : (sub.text_en || "");
    const customTrans = state.editedStarredTranslation[idx] !== undefined
      ? state.editedStarredTranslation[idx]
      : (sub.text_kr || "");

    const timeStr = (sub.start_ms !== undefined && sub.end_ms !== undefined)
      ? `${formatTime(sub.start_ms)} ~ ${formatTime(sub.end_ms)}`
      : `문장 #${idx + 1}`;

    const item = document.createElement("div");
    item.className = "anki-card";
    item.style.marginBottom = "8px";

    item.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; gap: 8px;">
        <span style="font-size: 11px; color: var(--text-secondary); font-family: var(--font-subtitle); white-space: nowrap;">
          ${timeStr}
        </span>
        <div style="display: flex; gap: 4px; align-items: center; flex-shrink: 0;">
          <button class="btn extract-star-btn" data-idx="${idx}" style="height: 24px; padding: 0 8px; font-size: 11px; background: rgba(34, 197, 94, 0.15); color: #34d399; border: 1px solid rgba(52, 211, 153, 0.3); border-radius: 4px; white-space: nowrap; cursor: pointer;">개별 추출</button>
          <button class="btn remove-star-btn" data-idx="${idx}" style="height: 24px; padding: 0 8px; font-size: 11px; background: rgba(248, 113, 113, 0.15); color: #f87171; border: 1px solid rgba(248, 113, 113, 0.3); border-radius: 4px; white-space: nowrap; cursor: pointer;">삭제</button>
        </div>
      </div>
      <textarea class="starred-sentence-input" data-idx="${idx}" rows="2" style="width: 100%; background: var(--bg-surface); color: var(--text-primary); border: 1px solid var(--border); border-radius: 8px; padding: 10px; font-size: 14px; font-family: var(--font-ui); outline: none; resize: vertical;" placeholder="영어 문장">${customText}</textarea>
      <input type="text" class="starred-translation-input" data-idx="${idx}" value="${customTrans}" placeholder="한국어 뜻 (비어있으면 Anki 전송 시 AI 자동 번역)" style="width: 100%; font-size: 13px; color: #34d399; background: var(--bg-surface); border: 1px solid var(--border); border-radius: 6px; padding: 6px 10px; margin-top: 6px; outline: none;">
    `;

    item.querySelector('.starred-sentence-input').addEventListener('input', (e) => {
      state.editedStarredText[idx] = e.target.value;
      saveStateToLocal();
    });

    item.querySelector('.starred-translation-input').addEventListener('input', (e) => {
      state.editedStarredTranslation[idx] = e.target.value;
      saveStateToLocal();
    });

    item.querySelector('.remove-star-btn').addEventListener('click', () => {
      state.starredSubtitles.delete(idx);
      delete state.editedStarredText[idx];
      delete state.editedStarredTranslation[idx];
      saveStateToLocal();
      renderStarredList();
      import('./subtitles.js').then(module => module.renderSubtitles());
    });

    item.querySelector('.extract-star-btn').addEventListener('click', async (e) => {
      const btn = e.target;
      if (!state.ankiConnected) {
        btn.textContent = "Anki 연결 필요";
        setTimeout(() => btn.textContent = "개별 추출", 2000);
        return;
      }

      const inputEn = item.querySelector('.starred-sentence-input');
      const inputKr = item.querySelector('.starred-translation-input');
      const sentence = inputEn.value.trim();
      const translation = inputKr.value.trim();
      if (!sentence) return;

      btn.disabled = true;
      btn.textContent = "추출 중...";

      try {
        const res = await addSentenceToAnki(sentence, translation);
        if (res && res.success) {
          state.starredSubtitles.delete(idx);
          delete state.editedStarredText[idx];
          delete state.editedStarredTranslation[idx];
          state.extractedSubtitles.add(idx);
          saveStateToLocal();

          btn.textContent = "성공!";
          inputEn.disabled = true;
          inputKr.disabled = true;
          item.style.opacity = "0.3";

          import('./subtitles.js').then(module => module.renderSubtitles());
          setTimeout(() => renderStarredList(), 1000);
        } else {
          btn.textContent = "실패";
          btn.disabled = false;
          setTimeout(() => btn.textContent = "개별 추출", 2000);
        }
      } catch (err) {
        btn.textContent = "오류";
        btn.disabled = false;
        setTimeout(() => btn.textContent = "개별 추출", 2000);
      }
    });

    starredSentencesContainer.appendChild(item);
  });
}

function renderVocabList() {
  if (!starredWordsContainer) return;
  starredWordsContainer.innerHTML = "";

  const exportVocabApkgBtn = document.getElementById("export-vocab-apkg-btn");
  const exportVocabCsvBtn = document.getElementById("export-vocab-csv-btn");

  const allVocab = getSavedVocab ? getSavedVocab() : [];
  const vocabList = allVocab.filter(v => !v.extracted);
  if (vocabList.length === 0) {
    if (exportVocabApkgBtn) exportVocabApkgBtn.disabled = true;
    if (exportVocabCsvBtn) exportVocabCsvBtn.disabled = true;
    starredWordsContainer.innerHTML = `
      <div style="text-align: center; color: var(--text-secondary); margin-top: 40px; font-size: 13px; line-height: 1.6;">
        보관된 단어/표현이 없습니다.<br>
        자막에서 단어를 클릭하여 <strong>'보관'</strong> 버튼을 눌러보세요.
      </div>
    `;
    return;
  }

  if (exportVocabApkgBtn) exportVocabApkgBtn.disabled = false;
  if (exportVocabCsvBtn) exportVocabCsvBtn.disabled = false;

  vocabList.forEach((v) => {
    const vCard = document.createElement("div");
    vCard.className = "anki-card";
    vCard.style.marginBottom = "8px";
    vCard.style.border = "1px solid rgba(167, 139, 250, 0.25)";

    vCard.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; gap: 8px;">
        <div style="display: flex; align-items: center; gap: 6px; flex: 1;">
          <input type="text" class="vocab-word-input" value="${v.word || ''}" style="font-weight: 600; font-size: 14px; color: var(--text-primary); background: transparent; border: 1px dashed rgba(255,255,255,0.15); border-radius: 4px; padding: 2px 6px; width: 100%; outline: none;" placeholder="단어/표현">
        </div>
        <div style="display: flex; gap: 4px; align-items: center; flex-shrink: 0;">
          <button class="btn extract-vocab-btn" style="height: 24px; padding: 0 8px; font-size: 11px; background: rgba(167, 139, 250, 0.15); color: #c4b5fd; border: 1px solid rgba(167, 139, 250, 0.3); border-radius: 4px; white-space: nowrap; cursor: pointer;">${v.extracted ? 'Anki 재전송' : 'Anki 전송'}</button>
          <button class="btn remove-vocab-btn" style="height: 24px; padding: 0 8px; font-size: 11px; background: rgba(248, 113, 113, 0.15); color: #f87171; border: 1px solid rgba(248, 113, 113, 0.3); border-radius: 4px; white-space: nowrap; cursor: pointer;">삭제</button>
        </div>
      </div>
      
      <div style="margin-bottom: 6px;">
        <input type="text" class="vocab-meaning-input" value="${v.meaning || ''}" style="width: 100%; font-size: 13px; font-weight: 500; color: #34d399; background: var(--bg-surface); border: 1px solid var(--border); border-radius: 6px; padding: 6px 8px; outline: none;" placeholder="뜻/해석">
      </div>

      <div style="margin-bottom: 6px;">
        <textarea class="vocab-exp-input" rows="2" style="width: 100%; font-size: 12px; color: var(--text-secondary); background: var(--bg-surface); border: 1px solid var(--border); border-radius: 6px; padding: 6px 8px; outline: none; resize: vertical;" placeholder="2단계 설명 (뜻·뉘앙스 / 콜로케이션)">${v.explanation || ''}</textarea>
      </div>

      <div>
        <input type="text" class="vocab-ex-input" value="${v.example || ''}" style="width: 100%; font-size: 11px; font-style: italic; color: var(--text-muted); background: var(--bg-surface); border: 1px solid var(--border); border-radius: 6px; padding: 4px 8px; outline: none;" placeholder="예문">
      </div>
    `;

    const saveChanges = () => {
      updateSavedVocabItem(v.id, {
        word: vCard.querySelector('.vocab-word-input').value.trim(),
        meaning: vCard.querySelector('.vocab-meaning-input').value.trim(),
        explanation: vCard.querySelector('.vocab-exp-input').value.trim(),
        example: vCard.querySelector('.vocab-ex-input').value.trim(),
      });
    };

    vCard.querySelectorAll('input, textarea').forEach(inp => {
      inp.addEventListener('input', saveChanges);
    });

    vCard.querySelector('.remove-vocab-btn').addEventListener('click', () => {
      deleteSavedVocabItem(v.id);
      renderStarredList();
      import('./subtitles.js').then(m => m.renderSubtitles());
    });

    vCard.querySelector('.extract-vocab-btn').addEventListener('click', async (e) => {
      const btn = e.target;
      if (!state.ankiConnected) {
        btn.textContent = "Anki 연결 필요";
        setTimeout(() => btn.textContent = "Anki 전송", 2000);
        return;
      }

      saveChanges();
      const word = vCard.querySelector('.vocab-word-input').value.trim();
      const meaning = vCard.querySelector('.vocab-meaning-input').value.trim();
      const explanation = vCard.querySelector('.vocab-exp-input').value.trim();
      const example = vCard.querySelector('.vocab-ex-input').value.trim();

      if (!word || !meaning) return;

      btn.disabled = true;
      btn.textContent = "전송 중...";

      try {
        const res = await addVocabCardToAnki({
          word, meaning, explanation, example, pos: v.pos || ""
        });
        if (res.success) {
          updateSavedVocabItem(v.id, { extracted: true });
          btn.textContent = "완료!";
          btn.style.color = "#34d399";
          setTimeout(() => {
            btn.disabled = false;
            btn.textContent = "Anki 재전송";
            btn.style.color = "";
          }, 2000);
        } else {
          btn.textContent = res.error || "실패";
          btn.disabled = false;
          setTimeout(() => btn.textContent = "Anki 전송", 2500);
        }
      } catch (err) {
        btn.textContent = "오류";
        btn.disabled = false;
        setTimeout(() => btn.textContent = "Anki 전송", 2000);
      }
    });

    starredWordsContainer.appendChild(vCard);
  });
}

function getStarredItemsData() {
  const sortedIndices = Array.from(state.starredSubtitles).sort((a, b) => a - b);
  const sourceName = state.currentEpisode ? (state.currentEpisode.video_filename || state.currentEpisode.ep_key) : "";
  return sortedIndices.map(idx => {
    const sub = state.subtitles[idx] || {};
    const sentence = state.editedStarredText[idx] !== undefined 
      ? state.editedStarredText[idx] 
      : (sub.text_en || "");
    const translation = state.editedStarredTranslation[idx] !== undefined
      ? state.editedStarredTranslation[idx]
      : (sub.text_kr || "");
    return {
      sentence,
      translation,
      item_type: 'sentence',
      source: sourceName,
      start_ms: sub.start_ms,
      end_ms: sub.end_ms
    };
  });
}

function getSavedVocabItemsData() {
  const vocabList = getSavedVocab ? getSavedVocab() : [];
  const sourceName = state.currentEpisode ? (state.currentEpisode.video_filename || state.currentEpisode.ep_key) : "";
  return vocabList.map(v => ({
    word: v.word || '',
    meaning: v.meaning || '',
    pos: v.pos || '',
    example: v.example || '',
    explanation: v.explanation || '',
    item_type: 'vocab',
    source: sourceName
  }));
}

// --- Anki Sentence Bulk Export with Real-Time Progress ---
async function bulkExportToAnki() {
  if (state.starredSubtitles.size === 0) return;

  if (!state.ankiConnected) {
    bulkExportProgress.style.display = "block";
    bulkExportStatus.style.color = "var(--danger)";
    bulkExportStatus.textContent = "Anki가 켜져 있지 않습니다.";
    setTimeout(() => {
      bulkExportProgress.style.display = "none";
    }, 3000);
    return;
  }

  if (ankiBulkExportBtn) ankiBulkExportBtn.disabled = true;
  bulkExportProgress.style.display = "block";
  bulkExportStatus.style.color = "var(--accent)";
  
  const inputs = Array.from(starredSentencesContainer.querySelectorAll('.starred-sentence-input'));
  const total = inputs.length;
  const items = [];

  inputs.forEach(input => {
    const sentence = input.value.trim();
    const idx = parseInt(input.getAttribute('data-idx'));
    if (sentence && !isNaN(idx)) {
      const transInput = starredSentencesContainer.querySelector(`.starred-translation-input[data-idx="${idx}"]`);
      const trans = transInput ? transInput.value.trim() : (state.editedStarredTranslation[idx] || (state.subtitles[idx] && state.subtitles[idx].text_kr) || "");
      items.push({
        idx: idx,
        sentence: sentence,
        translation: trans
      });
    }
  });

  if (items.length === 0) {
    if (ankiBulkExportBtn) ankiBulkExportBtn.disabled = false;
    bulkExportProgress.style.display = "none";
    return;
  }

  let completedCount = 0;
  let successCount = 0;
  bulkExportStatus.textContent = `문장 전송 중... (0/${total})`;

  // Process concurrently in chunks of 4 for fast, reliable real-time progress
  const CHUNK_SIZE = 4;
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    await Promise.all(chunk.map(async (item) => {
      try {
        const res = await addSentenceToAnki(item.sentence, item.translation);
        const isOk = (res === true) || (res && (res.success || res.duplicate || res.note_id));
        if (isOk) {
          successCount++;
          state.starredSubtitles.delete(item.idx);
          delete state.editedStarredText[item.idx];
          delete state.editedStarredTranslation[item.idx];
          state.extractedSubtitles.add(item.idx);
        }
      } catch (err) {
        console.warn(`Failed to export sentence #${item.idx}:`, err);
      } finally {
        completedCount++;
        bulkExportStatus.textContent = `문장 전송 중... (${completedCount}/${total})`;
      }
    }));

    saveStateToLocal();
    renderSubtitles();
    updateStarredCounts();
  }

  bulkExportStatus.style.color = successCount > 0 ? "var(--success)" : "var(--danger)";
  bulkExportStatus.textContent = `완료! (${successCount}/${total} 문장 Anki 전송 완료)`;

  if (ankiBulkExportBtn) ankiBulkExportBtn.disabled = false;
  setTimeout(() => {
    bulkExportProgress.style.display = "none";
    renderStarredList();
  }, 1500);
}

// --- Anki Vocab Bulk Export with Real-Time Progress ---
async function bulkExportVocabToAnki() {
  const vocabList = getSavedVocab ? getSavedVocab() : [];
  if (vocabList.length === 0) return;

  if (!state.ankiConnected) {
    bulkExportProgress.style.display = "block";
    bulkExportStatus.style.color = "var(--danger)";
    bulkExportStatus.textContent = "Anki가 켜져 있지 않습니다.";
    setTimeout(() => {
      bulkExportProgress.style.display = "none";
    }, 3000);
    return;
  }

  if (ankiBulkVocabExportBtn) ankiBulkVocabExportBtn.disabled = true;
  bulkExportProgress.style.display = "block";
  bulkExportStatus.style.color = "var(--accent)";
  
  const total = vocabList.length;
  let completedCount = 0;
  let successCount = 0;
  bulkExportStatus.textContent = `단어 전송 중... (0/${total})`;

  const CHUNK_SIZE = 4;
  for (let i = 0; i < vocabList.length; i += CHUNK_SIZE) {
    const chunk = vocabList.slice(i, i + CHUNK_SIZE);
    await Promise.all(chunk.map(async (v) => {
      try {
        const res = await addVocabCardToAnki({
          word: v.word,
          meaning: v.meaning,
          explanation: v.explanation || "",
          example: v.example || "",
          pos: v.pos || ""
        });
        const isOk = (res === true) || (res && (res.success || res.duplicate || res.note_id));
        if (isOk) {
          successCount++;
          updateSavedVocabItem(v.id, { extracted: true });
        }
      } catch (err) {
        console.warn(`Failed to export vocab '${v.word}':`, err);
      } finally {
        completedCount++;
        bulkExportStatus.textContent = `단어 전송 중... (${completedCount}/${total})`;
      }
    }));

    renderSubtitles();
    updateStarredCounts();
  }

  bulkExportStatus.style.color = successCount > 0 ? "var(--success)" : "var(--danger)";
  bulkExportStatus.textContent = `완료! (${successCount}/${total} 단어 Anki 전송 완료)`;

  if (ankiBulkVocabExportBtn) ankiBulkVocabExportBtn.disabled = false;
  setTimeout(() => {
    bulkExportProgress.style.display = "none";
    renderStarredList();
  }, 1500);
}
