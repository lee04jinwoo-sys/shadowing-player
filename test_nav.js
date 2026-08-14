const state = {
  currentSubtitleIndex: -1,
  subtitles: [
    { start_ms: 1000, end_ms: 2000 },
    { start_ms: 3000, end_ms: 4000 }
  ],
  dictationModeActive: false
};
const player = { getCurrentTimeMs: () => 500 };
function getNavBaseIndex() {
  if (state.currentSubtitleIndex !== -1) return state.currentSubtitleIndex;
  const timeMs = player.getCurrentTimeMs();
  for (let i = 0; i < state.subtitles.length; i++) {
    if (state.subtitles[i].start_ms > timeMs) return i - 1; 
  }
  return state.subtitles.length - 1;
}
console.log(getNavBaseIndex());
