import type {
  AnkiStatus,
  AppSettings,
  DictLookupResult,
  Episode,
  ExportItemPayload,
  GoogleAuthStatus,
  SubtitleItem,
  SubscriptionsResponse,
  YouTubeInfoResponse,
  YouTubeVideoCard,
} from './types';

async function fetchWithTimeout(input: string, init: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const id = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(id);
  }
}

export async function fetchEpisodeList(forceRefresh = false): Promise<Episode[]> {
  const url = forceRefresh ? '/api/files?refresh=1' : '/api/files';
  const res = await fetchWithTimeout(url, {}, 6000);
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  const data: unknown = await res.json();
  return Array.isArray(data) ? (data as Episode[]) : [];
}

export async function fetchSubtitles(epKey: string): Promise<SubtitleItem[]> {
  const res = await fetchWithTimeout(`/api/subtitles/${encodeURIComponent(epKey)}`, {}, 8000);
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  const data: unknown = await res.json();
  return Array.isArray(data) ? (data as SubtitleItem[]) : [];
}

export async function fetchSubtitlesOnline(epKey: string): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(`/api/subtitles/${encodeURIComponent(epKey)}/fetch`, { method: 'POST' });
  return (await res.json()) as { success: boolean; error?: string };
}

export async function checkAnkiConnection(): Promise<AnkiStatus> {
  try {
    const res = await fetch('/api/anki/status');
    if (!res.ok) return { connected: false, reason: 'player_down' };
    return (await res.json()) as AnkiStatus;
  } catch {
    return { connected: false, reason: 'player_down' };
  }
}

export async function addSentenceToAnki(
  sentence: string,
  translation = '',
): Promise<{ success: boolean; duplicate?: boolean; note_id?: number | string; error?: string }> {
  try {
    const res = await fetch('/api/anki/add-sentence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sentence, translation }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { detail?: string };
      if (err.detail && err.detail.toLowerCase().includes('duplicate')) {
        return { success: true, duplicate: true };
      }
      return { success: false, error: err.detail || '전송 실패' };
    }
    return (await res.json()) as { success: boolean; duplicate?: boolean; note_id?: number | string };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : '전송 실패' };
  }
}

export async function getAIExplanation(
  sentence: string,
): Promise<{ success: boolean; explanation?: string; error?: string }> {
  const res = await fetch('/api/ai/explain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sentence }),
  });
  if (!res.ok) throw new Error('AI 응답 실패');
  return (await res.json()) as { success: boolean; explanation?: string; error?: string };
}

export async function lookupWord(word: string, context = ''): Promise<DictLookupResult> {
  const res = await fetch('/api/dict/lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ word, context }),
  });
  if (!res.ok) throw new Error('단어 조회 실패');
  return (await res.json()) as DictLookupResult;
}

export async function addVocabCardToAnki(payload: {
  word: string;
  meaning: string;
  pos?: string;
  example?: string;
  explanation?: string;
}): Promise<{ success: boolean; duplicate?: boolean; note_id?: number | string; error?: string }> {
  try {
    const res = await fetch('/api/dict/add-to-anki', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      duplicate?: boolean;
      note_id?: number | string;
      error?: string;
      detail?: string;
    };
    if (!res.ok) {
      const msg = data.detail || data.error || `단어 전송 실패 (${res.status})`;
      return {
        success: false,
        duplicate: data.duplicate || msg.toLowerCase().includes('duplicate'),
        error: msg,
      };
    }
    return {
      success: Boolean(data.success),
      duplicate: data.duplicate,
      note_id: data.note_id,
      error: data.error ?? data.detail,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : '단어 전송 중 네트워크 오류',
    };
  }
}

export async function fetchYouTubeInfo(url: string): Promise<YouTubeInfoResponse> {
  const res = await fetch('/api/youtube/info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(err.detail || '올바른 YouTube 영상 링크(11자리 비디오 ID)가 아닙니다.');
  }
  return (await res.json()) as YouTubeInfoResponse;
}

export async function fetchYouTubeSubtitles(videoId: string): Promise<SubtitleItem[]> {
  const res = await fetch(`/api/youtube/subtitles/${encodeURIComponent(videoId)}`);
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  const data: unknown = await res.json();
  return Array.isArray(data) ? (data as SubtitleItem[]) : [];
}

export async function searchYouTube(query: string, limit = 16): Promise<YouTubeVideoCard[]> {
  const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(query)}&limit=${limit}`);
  if (!res.ok) throw new Error('YouTube 검색 실패');
  const data = (await res.json()) as { results?: YouTubeVideoCard[] };
  return data.results || [];
}

export async function fetchUserSubscriptions(): Promise<SubscriptionsResponse> {
  const res = await fetch('/api/youtube/subscriptions');
  if (!res.ok) throw new Error('구독 채널 목록 조회 실패');
  return (await res.json()) as SubscriptionsResponse;
}

export async function fetchChannelVideos(
  channelId: string,
  title = '',
  limit = 12,
): Promise<YouTubeVideoCard[]> {
  const res = await fetch(
    `/api/youtube/subscriptions/channel/${encodeURIComponent(channelId)}?title=${encodeURIComponent(title)}&limit=${limit}`,
  );
  if (!res.ok) throw new Error('채널 영상 목록 조회 실패');
  const data = (await res.json()) as { results?: YouTubeVideoCard[] };
  return data.results || [];
}

export async function getGoogleAuthStatus(): Promise<GoogleAuthStatus> {
  const res = await fetch('/api/auth/google/status');
  if (!res.ok) throw new Error('Google 연동 상태 조회 실패');
  return (await res.json()) as GoogleAuthStatus;
}

export async function getGoogleAuthUrl(): Promise<{ success: boolean; auth_url?: string | null; error?: string }> {
  const res = await fetch('/api/auth/google/url');
  return (await res.json()) as { success: boolean; auth_url?: string | null; error?: string };
}

export async function saveGoogleCredentials(
  clientId: string,
  clientSecret: string,
): Promise<{ success: boolean }> {
  const res = await fetch('/api/auth/google/credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
  });
  if (!res.ok) throw new Error('Google OAuth 설정 저장 실패');
  return (await res.json()) as { success: boolean };
}

export async function logoutGoogle(): Promise<{ success: boolean }> {
  const res = await fetch('/api/auth/google/logout', { method: 'POST' });
  return (await res.json()) as { success: boolean };
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export async function exportApkg(items: ExportItemPayload[], deckName = 'Shadowing Player Deck'): Promise<void> {
  const res = await fetch('/api/export/apkg', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, deck_name: deckName }),
  });
  if (!res.ok) throw new Error('APKG 생성 실패');
  const blob = await res.blob();
  triggerDownload(blob, `${deckName.replace(/[^a-zA-Z0-9가-힣_-]/g, '_')}.apkg`);
}

export async function exportCsv(items: ExportItemPayload[], deckName = 'Shadowing Sentences'): Promise<void> {
  const res = await fetch('/api/export/csv', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, deck_name: deckName }),
  });
  if (!res.ok) throw new Error('CSV 생성 실패');
  const blob = await res.blob();
  triggerDownload(blob, `${deckName.replace(/[^a-zA-Z0-9가-힣_-]/g, '_')}.csv`);
}

export async function fetchSettings(): Promise<AppSettings> {
  const res = await fetch('/api/settings/');
  if (!res.ok) throw new Error('설정 불러오기 실패');
  return (await res.json()) as AppSettings;
}

export async function saveSettings(payload: {
  google_api_key?: string;
  video_dir?: string;
}): Promise<{ success: boolean; message?: string }> {
  const res = await fetch('/api/settings/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('설정 저장 실패');
  return (await res.json()) as { success: boolean; message?: string };
}

export async function fetchLogPath(): Promise<{ log_path: string; exists: boolean }> {
  const res = await fetch('/api/settings/log-path');
  if (!res.ok) throw new Error('로그 경로 조회 실패');
  return (await res.json()) as { log_path: string; exists: boolean };
}

export async function selectFolder(): Promise<{ folder_path: string | null; canceled: boolean }> {
  const res = await fetch('/api/settings/select-folder', { method: 'POST' });
  if (!res.ok) throw new Error('폴더 선택 대화상자 호출 실패');
  return (await res.json()) as { folder_path: string | null; canceled: boolean };
}
