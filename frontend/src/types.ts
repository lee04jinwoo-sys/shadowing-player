export type SourceMode = 'local' | 'youtube' | 'explore';
export type SidebarMode = 'listening' | 'dictation' | 'anki';
export type ExtractionTab = 'sentences' | 'words';
export type ThemeMode = 'dark' | 'light';

export interface Episode {
  ep_key: string;
  video_filename: string;
  video_path?: string;
  subtitle_path?: string | null;
  format: string;
}

export interface SubtitleItem {
  start_ms: number;
  end_ms: number;
  text_en: string;
  text_kr?: string;
}

export interface AnkiStatus {
  connected: boolean;
  reason: 'ok' | 'gateway_unreachable' | 'anki_down' | 'player_down' | string;
}

export interface YouTubeHistoryItem {
  id: string;
  title: string;
  addedAt: number;
}

export interface LastWatchedState {
  epKey: string;
  timeMs: number;
  sourceMode: 'local' | 'youtube';
}

export interface SavedVocabItem {
  id: string;
  word: string;
  meaning: string;
  pos: string;
  example: string;
  explanation: string;
  extracted: boolean;
  note_id?: number | string | null;
  createdAt?: number;
  updatedAt?: number;
}

export interface WordTokenSegment {
  text: string;
  word: string;
  isWord: boolean;
  status: 'plain' | 'starred' | 'extracted';
}

export type DiffStatus = 'correct' | 'wrong' | 'missing' | 'extra';

export interface DiffWordItem {
  word: string;
  status: DiffStatus;
  typed?: string;
}

export interface DictRelatedPhrase {
  phrase: string;
  meaning?: string;
}

export interface DictLookupResult {
  word: string;
  lemma?: string;
  phonetic?: string;
  pos?: string;
  meaning: string;
  explanation?: string;
  example?: string;
  related_phrase?: DictRelatedPhrase | null;
}

export interface DictPopoverAnchor {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface DictPopoverRequest {
  word: string;
  context: string;
  anchorRect: DictPopoverAnchor;
}

export interface YouTubeInfoResponse {
  success: boolean;
  video_id: string;
  title: string;
  error?: string;
}

export interface YouTubeVideoCard {
  video_id: string;
  title: string;
  thumbnail: string;
  channel: string;
  duration_str?: string;
}

export interface YouTubeChannel {
  channel_id: string;
  title: string;
  thumbnail?: string;
}

export interface SubscriptionsResponse {
  success: boolean;
  authenticated: boolean;
  channels: YouTubeChannel[];
}

export interface GoogleAuthStatus {
  authenticated: boolean;
  email: string;
  channels_count: number;
  has_client_id: boolean;
}

export interface AppSettings {
  google_api_key: string;
  video_dir: string;
  log_path: string;
}

export interface ExportItemPayload {
  sentence?: string;
  word?: string;
  meaning?: string;
  translation?: string;
  pos?: string;
  example?: string;
  explanation?: string;
  source?: string;
  item_type: 'sentence' | 'vocab';
  start_ms?: number;
  end_ms?: number;
}

export type ToastTone = 'info' | 'success' | 'warn' | 'error';

export interface ToastMessage {
  id: string;
  text: string;
  tone: ToastTone;
}

export interface YTPlayerInstance {
  loadVideoById(videoId: string): void;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getPlayerState(): number;
  setPlaybackRate(suggestedRate: number): void;
  destroy(): void;
}

export interface YTPlayerConstructor {
  new (
    elementId: string,
    options: {
      videoId: string;
      width: string;
      height: string;
      playerVars: Record<string, number>;
      events: {
        onReady?: (event: { target: YTPlayerInstance }) => void;
        onStateChange?: (event: { data: number; target: YTPlayerInstance }) => void;
      };
    },
  ): YTPlayerInstance;
}

declare global {
  interface Window {
    YT?: {
      Player: YTPlayerConstructor;
      PlayerState: {
        UNSTARTED: number;
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
    };
    _ytAPIReady?: boolean;
    onYouTubeIframeAPIReady?: () => void;
  }
}
