// ====================================
// api.js — 백엔드 API 호출 함수 모음
// ====================================

export async function fetchEpisodeList(forceRefresh = false) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);
  try {
    const url = forceRefresh ? "/api/files?refresh=1" : "/api/files";
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    return await res.json();
  } catch (err) {
    clearTimeout(timeoutId);
    console.error("fetchEpisodeList failed:", err);
    throw err;
  }
}

export async function fetchSubtitles(epKey) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`/api/subtitles/${epKey}`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    return await res.json();
  } catch (err) {
    clearTimeout(timeoutId);
    console.error("fetchSubtitles failed:", err);
    throw err;
  }
}

export async function fetchSubtitlesOnline(epKey) {
  const res = await fetch(`/api/subtitles/${epKey}/fetch`, { method: "POST" });
  return await res.json();
}

export async function checkAnkiConnection() {
  try {
    const res = await fetch("/api/anki/status");
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

export async function addSentenceToAnki(sentence, translation = "") {
  try {
    const res = await fetch("/api/anki/add-sentence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sentence, translation })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (err.detail && err.detail.toLowerCase().includes("duplicate")) {
        return { success: true, duplicate: true };
      }
      return { success: false, error: err.detail || "전송 실패" };
    }
    const data = await res.json();
    return data;
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function bulkAddSentencesToAnki(items) {
  const res = await fetch("/api/anki/bulk-add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items })
  });
  if (!res.ok) throw new Error("Bulk add failed");
  return await res.json();
}

export async function bulkAddVocabToAnki(items) {
  const res = await fetch("/api/anki/bulk-add-vocab", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "단어 일괄 Anki 전송 실패");
  }
  return await res.json();
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

export async function lookupWord(word, context = "") {
  const res = await fetch("/api/dict/lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ word, context })
  });
  if (!res.ok) throw new Error("단어 조회 실패");
  return await res.json();
}

export async function addVocabCardToAnki(data) {
  const res = await fetch("/api/dict/add-to-anki", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return await res.json();
}

// --- YouTube API ---
export async function fetchYouTubeInfo(url) {
  const res = await fetch("/api/youtube/info", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "올바른 YouTube 영상 링크(11자리 비디오 ID)가 아닙니다.");
  }
  return await res.json();
}

export async function fetchYouTubeSubtitles(videoId) {
  const res = await fetch(`/api/youtube/subtitles/${videoId}`);
  return await res.json();
}

export async function searchYouTube(query, limit = 16) {
  const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(query)}&limit=${limit}`);
  if (!res.ok) throw new Error("YouTube 검색 실패");
  const data = await res.json();
  return data.results || [];
}

export async function fetchUserSubscriptions() {
  const res = await fetch("/api/youtube/subscriptions");
  if (!res.ok) throw new Error("구독 채널 목록 조회 실패");
  return await res.json();
}

export async function fetchChannelVideos(channelId, title = "", limit = 12) {
  const res = await fetch(`/api/youtube/subscriptions/channel/${encodeURIComponent(channelId)}?title=${encodeURIComponent(title)}&limit=${limit}`);
  if (!res.ok) throw new Error("채널 영상 목록 조회 실패");
  const data = await res.json();
  return data.results || [];
}

// --- Google Auth API ---
export async function getGoogleAuthStatus() {
  const res = await fetch("/api/auth/google/status");
  return await res.json();
}

export async function getGoogleAuthUrl() {
  const res = await fetch("/api/auth/google/url");
  return await res.json();
}

export async function saveGoogleDirectToken(token) {
  const res = await fetch("/api/auth/google/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: token })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Google 토큰 등록 실패");
  }
  return await res.json();
}

export async function saveGoogleCredentials(clientId, clientSecret) {
  const res = await fetch("/api/auth/google/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret })
  });
  if (!res.ok) throw new Error("Google OAuth 설정 저장 실패");
  return await res.json();
}

export async function logoutGoogle() {
  const res = await fetch("/api/auth/google/logout", { method: "POST" });
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

// --- Settings API ---
export async function fetchSettings() {
  const res = await fetch("/api/settings/");
  if (!res.ok) throw new Error("설정 불러오기 실패");
  return await res.json();
}

export async function saveSettings(data) {
  const res = await fetch("/api/settings/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error("설정 저장 실패");
  return await res.json();
}

export async function fetchLogPath() {
  const res = await fetch("/api/settings/log-path");
  if (!res.ok) throw new Error("로그 경로 조회 실패");
  return await res.json();
}

export async function selectFolder() {
  const res = await fetch("/api/settings/select-folder", { method: "POST" });
  if (!res.ok) throw new Error("폴더 선택 대화상자 호출 실패");
  return await res.json();
}


