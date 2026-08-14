const state = {
  currentSubtitleIndex: -1,
  subtitles: [
    { start_ms: 1000, end_ms: 2000, text_en: "one" },
    { start_ms: 3000, end_ms: 4000, text_en: "two" },
    { start_ms: 5000, end_ms: 6000, text_en: "three" }
  ],
  dictationModeActive: false
};

const player = {
  getCurrentTimeMs: () => 2500 // In the gap between 0 and 1
};

function isShortSubtitle(sub) { return false; }

function getNavBaseIndex() {
  if (state.currentSubtitleIndex !== -1) return state.currentSubtitleIndex;
  const timeMs = player.getCurrentTimeMs();
  for (let i = 0; i < state.subtitles.length; i++) {
    if (state.subtitles[i].start_ms > timeMs) return i - 1; 
  }
  return state.subtitles.length - 1;
}

function playNextSubtitle() {
  if (state.subtitles.length === 0) return;
  const baseIdx = getNavBaseIndex(); 
  
  console.log("Next: baseIdx = " + baseIdx);

  let targetIdx = -1;
  for (let i = baseIdx + 1; i < state.subtitles.length; i++) {
    if (state.dictationModeActive && isShortSubtitle(state.subtitles[i])) continue;
    targetIdx = i;
    break;
  }
  if (targetIdx === -1) targetIdx = state.subtitles.length - 1;
  console.log("Next: seek to " + targetIdx);
}

playNextSubtitle();
