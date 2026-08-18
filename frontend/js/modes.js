// ====================================
// modes.js — 학습 모드 (리스닝/쉐도잉/맞추기/추출)
// ====================================

import state, { saveStateToLocal } from './state.js?v=20260818_1000';
import { renderSubtitles, updateActiveSubtitleUI, updateSubVisibility, toggleStar, formatTime } from './subtitles.js?v=20260818_1000';
import { addSentenceToAnki, bulkAddSentencesToAnki, getAIExplanation } from './api.js?v=20260818_1000';

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

const starredListContainer = document.getElementById("starred-list-container");
const starredCount = document.getElementById("starred-count");
const ankiBulkExportBtn = document.getElementById("anki-bulk-export-btn");
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

  // Anki bulk export & File exports
  ankiBulkExportBtn.addEventListener("click", bulkExportToAnki);

  const exportApkgBtn = document.getElementById("export-apkg-btn");
  const exportCsvBtn = document.getElementById("export-csv-btn");

  if (exportApkgBtn) {
    exportApkgBtn.addEventListener("click", async () => {
      const items = getStarredItemsData();
      if (items.length === 0) return;
      const originalText = exportApkgBtn.innerHTML;
      exportApkgBtn.disabled = true;
      exportApkgBtn.textContent = "생성 중...";
      try {
        const { exportApkg } = await import('./api.js');
        await exportApkg(items);
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
        await exportCsv(items);
      } catch (err) {
        alert("CSV 내보내기 실패: " + err.message);
      } finally {
        exportCsvBtn.disabled = false;
        exportCsvBtn.innerHTML = originalText;
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
      if (sttMicLabel) sttMicLabel.textContent = "🔴 듣는 중...";

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

function getStarredItemsData() {
  if (state.starredSubtitles.size === 0) {
    alert("보관된 문장이 없습니다! 먼저 '⭐ 보관' 버튼을 눌러 문장을 보관해 주세요.");
    return [];
  }

  const items = [];
  const sortedIndices = Array.from(state.starredSubtitles).sort((a, b) => a - b);
  
  sortedIndices.forEach((idx) => {
    const sub = state.subtitles[idx] || {};
    const customText = state.editedStarredText[idx] !== undefined 
      ? state.editedStarredText[idx] 
      : (sub.text_en || "");
    
    if (!customText) return;

    let translation = sub.text_kr || "";
    let source = "Shadowing Player";
    if (state.currentEpisode && state.currentEpisode.title) {
      source = state.currentEpisode.title;
    } else if (state.currentEpisode && state.currentEpisode.ep_key) {
      source = state.currentEpisode.ep_key;
    }

    items.push({
      sentence: customText,
      translation: translation,
      source: source
    });
  });

  if (items.length === 0) {
    alert("내보낼 문장 텍스트를 찾을 수 없습니다. 자막이 로드되었는지 확인해 주세요!");
  }

  return items;
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

// --- Starred List (Anki Extraction) ---
export function renderStarredList() {
  if (!starredCount || !starredListContainer) return;
  
  // Save current textarea values
  starredListContainer.querySelectorAll('.starred-sentence-input').forEach(input => {
    state.editedStarredText[parseInt(input.getAttribute('data-idx'))] = input.value;
  });

  starredCount.textContent = state.starredSubtitles.size;
  starredListContainer.innerHTML = "";
  
  const exportApkgBtn = document.getElementById("export-apkg-btn");
  const exportCsvBtn = document.getElementById("export-csv-btn");

  if (state.starredSubtitles.size === 0) {
    starredListContainer.innerHTML = `
      <div style="text-align: center; color: var(--text-secondary); margin-top: 40px;">
        보관된 문장이 없습니다.<br>맞추기 모드에서 '⭐ 보관 (A)' 버튼을 눌러 문장을 모아보세요.
      </div>
    `;
    if (ankiBulkExportBtn) ankiBulkExportBtn.disabled = true;
    return;
  }
  
  if (ankiBulkExportBtn) ankiBulkExportBtn.disabled = false;
  if (exportApkgBtn) exportApkgBtn.disabled = false;
  if (exportCsvBtn) exportCsvBtn.disabled = false;
  
  const sortedIndices = Array.from(state.starredSubtitles).sort((a, b) => a - b);
  
  sortedIndices.forEach((idx) => {
    const sub = state.subtitles[idx] || {};
    const customText = state.editedStarredText[idx] !== undefined 
      ? state.editedStarredText[idx] 
      : (sub.text_en || "");
    
    const timeStr = (sub.start_ms !== undefined && sub.end_ms !== undefined)
      ? `${formatTime(sub.start_ms)} ~ ${formatTime(sub.end_ms)}`
      : `문장 #${idx + 1}`;

    const item = document.createElement("div");
    item.className = "anki-card";
    item.style.marginBottom = "0";
    
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
      <textarea class="starred-sentence-input" data-idx="${idx}" rows="2" style="width: 100%; background: var(--bg-surface); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px; font-size: 14px; font-family: var(--font-ui); outline: none; resize: vertical;">${customText}</textarea>
      ${sub.text_kr ? `<div style="font-size: 12px; color: var(--text-secondary); margin-top: 8px;">${sub.text_kr}</div>` : ''}
    `;
    
    item.querySelector('.starred-sentence-input').addEventListener('input', (e) => {
      state.editedStarredText[idx] = e.target.value;
      saveStateToLocal();
    });
    
    item.querySelector('.remove-star-btn').addEventListener('click', () => {
      state.starredSubtitles.delete(idx);
      delete state.editedStarredText[idx];
      saveStateToLocal();
      renderStarredList();
      // Re-render subtitles to remove star border
      import('./subtitles.js').then(module => module.renderSubtitles());
    });
    
    item.querySelector('.extract-star-btn').addEventListener('click', async (e) => {
      const btn = e.target;
      if (!state.ankiConnected) {
        btn.textContent = "Anki 연결 필요";
        setTimeout(() => btn.textContent = "개별 추출", 2000);
        return;
      }
      
      const input = item.querySelector('.starred-sentence-input');
      const sentence = input.value.trim();
      if (!sentence) return;
      
      btn.disabled = true;
      btn.textContent = "추출 중...";
      
      try {
        const { addSentenceToAnki } = await import('./api.js');
        const ok = await addSentenceToAnki(sentence);
        if (ok) {
          state.starredSubtitles.delete(idx);
          delete state.editedStarredText[idx];
          state.extractedSubtitles.add(idx);
          saveStateToLocal();
          
          btn.textContent = "성공!";
          input.disabled = true;
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
    
    starredListContainer.appendChild(item);
  });
}

// --- Anki Bulk Export ---
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

  ankiBulkExportBtn.disabled = true;
  bulkExportProgress.style.display = "block";
  bulkExportStatus.style.color = "var(--accent)";
  
  const inputs = Array.from(starredListContainer.querySelectorAll('.starred-sentence-input'));
  const total = inputs.length;
  const items = [];
  const idxList = [];

  inputs.forEach(input => {
    const sentence = input.value.trim();
    const idx = parseInt(input.getAttribute('data-idx'));
    if (sentence) {
      const sub = state.subtitles[idx] || {};
      items.push({
        sentence: sentence,
        translation: sub.text_kr || ""
      });
      idxList.push(idx);
    }
  });

  if (items.length === 0) {
    ankiBulkExportBtn.disabled = false;
    bulkExportProgress.style.display = "none";
    return;
  }

  bulkExportStatus.textContent = `전송 중... (0/${total})`;

  try {
    const res = await bulkAddSentencesToAnki(items);
    if (res.success) {
      idxList.forEach(idx => {
        state.starredSubtitles.delete(idx);
        delete state.editedStarredText[idx];
        state.extractedSubtitles.add(idx);
      });
      saveStateToLocal();
      renderSubtitles();
      
      bulkExportStatus.style.color = "var(--success)";
      bulkExportStatus.textContent = `완료! (${res.count || items.length}/${total} 전송 성공)`;
    } else {
      bulkExportStatus.style.color = "var(--danger)";
      bulkExportStatus.textContent = `오류: ${res.error || "전송 실패"}`;
    }
  } catch (err) {
    console.error("Bulk add error:", err);
    bulkExportStatus.style.color = "var(--danger)";
    bulkExportStatus.textContent = "네트워크 전송 오류 발생";
  } finally {
    ankiBulkExportBtn.disabled = false;
    setTimeout(() => {
      bulkExportProgress.style.display = "none";
      renderStarredList();
    }, 2500);
  }
}
