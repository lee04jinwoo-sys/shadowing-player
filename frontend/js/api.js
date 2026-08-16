// ====================================
// api.js — 백엔드 API 호출 함수 모음
// ====================================

export async function fetchEpisodeList() {
  const res = await fetch("/api/files");
  return await res.json();
}

export async function fetchSubtitles(epKey) {
  const res = await fetch(`/api/subtitles/${epKey}`);
  return await res.json();
}

export async function fetchSubtitlesOnline(epKey) {
  const res = await fetch(`/api/subtitles/${epKey}/fetch`, { method: "POST" });
  return await res.json();
}

export async function checkAnkiConnection() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);
    const res = await fetch("/api/anki/status", { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return false;
    const data = await res.json();
    return data.connected;
  } catch {
    return false;
  }
}

export async function launchAnki() {
  try {
    await fetch("/api/anki/launch", { method: "POST" });
  } catch (err) {
    console.error("Failed to launch Anki:", err);
  }
}

export async function addSentenceToAnki(sentence) {
  const res = await fetch("/api/anki/add-sentence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sentence })
  });
  return res.ok;
}

export async function getAIExplanation(sentence) {
  const res = await fetch("/api/ai/explain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sentence })
  });
  if (!res.ok) throw new Error("AI 응답 실패");
  return await res.json();
}

// --- YouTube API ---
export async function fetchYouTubeInfo(url) {
  const res = await fetch("/api/youtube/info", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url })
  });
  if (!res.ok) throw new Error("YouTube 정보 가져오기 실패");
  return await res.json();
}

export async function fetchYouTubeSubtitles(videoId) {
  const res = await fetch(`/api/youtube/subtitles/${videoId}`);
  return await res.json();
}

// --- Export API ---
export async function exportApkg(items, deckName = "Shadowing Player Deck") {
  const res = await fetch("/api/export/apkg", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items, deck_name: deckName })
  });
  if (!res.ok) throw new Error("APKG 생성 실패");
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${deckName.replace(/[^a-zA-Z0-9가-힣_-]/g, '_')}.apkg`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export async function exportCsv(items, deckName = "Shadowing Sentences") {
  const res = await fetch("/api/export/csv", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items, deck_name: deckName })
  });
  if (!res.ok) throw new Error("CSV 생성 실패");
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${deckName.replace(/[^a-zA-Z0-9가-힣_-]/g, '_')}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
