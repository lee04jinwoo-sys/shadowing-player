import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  FolderOpen,
  KeyRound,
  Link2,
  Loader2,
  LogOut,
  Save,
  Settings,
  Terminal,
  X,
} from 'lucide-react';
import {
  fetchLogPath,
  fetchSettings,
  getGoogleAuthStatus,
  getGoogleAuthUrl,
  logoutGoogle,
  saveGoogleCredentials,
  saveSettings,
  selectFolder,
} from '../api';
import type { GoogleAuthStatus, ToastTone } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEpisodesReload: () => void;
  onSubscriptionsRefresh: () => void;
  onToast: (msg: string, tone?: ToastTone) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onEpisodesReload,
  onSubscriptionsRefresh,
  onToast,
}) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickingFolder, setPickingFolder] = useState(false);

  const [apiKey, setApiKey] = useState('');
  const [videoDir, setVideoDir] = useState('');
  const [logPath, setLogPath] = useState('');

  const [authStatus, setAuthStatus] = useState<GoogleAuthStatus | null>(null);
  const [showOAuthCreds, setShowOAuthCreds] = useState(false);
  const [oauthClientId, setOauthClientId] = useState('');
  const [oauthClientSecret, setOauthClientSecret] = useState('');
  const [savingCreds, setSavingCreds] = useState(false);
  const [authActionBusy, setAuthActionBusy] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, logRes, authRes] = await Promise.all([
        fetchSettings().catch(() => null),
        fetchLogPath().catch(() => null),
        getGoogleAuthStatus().catch(() => null),
      ]);

      if (settingsRes) {
        setApiKey(settingsRes.google_api_key || '');
        setVideoDir(settingsRes.video_dir || '');
        if (settingsRes.log_path && !logRes?.log_path) {
          setLogPath(settingsRes.log_path);
        }
      }
      if (logRes) {
        setLogPath(logRes.log_path || '');
      }
      if (authRes) {
        setAuthStatus(authRes);
        setShowOAuthCreds(!authRes.has_client_id && !authRes.authenticated);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void loadAll();
  }, [isOpen, loadAll]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string } | null;
      if (data?.type === 'GOOGLE_AUTH_SUCCESS') {
        onToast('Google 계정 연동이 완료되었습니다.', 'success');
        void getGoogleAuthStatus()
          .then((res) => setAuthStatus(res))
          .catch(() => null);
        onSubscriptionsRefresh();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onSubscriptionsRefresh, onToast]);

  const handleSelectFolder = async () => {
    setPickingFolder(true);
    try {
      const res = await selectFolder();
      if (!res.canceled && res.folder_path) {
        setVideoDir(res.folder_path);
      }
    } catch {
      onToast('폴더 선택 창을 여는 데 실패했습니다.', 'error');
    } finally {
      setPickingFolder(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: { google_api_key?: string; video_dir?: string } = {
        video_dir: videoDir.trim(),
      };
      const trimmedKey = apiKey.trim();
      if (trimmedKey && !trimmedKey.includes('***')) {
        payload.google_api_key = trimmedKey;
      }
      const res = await saveSettings(payload);
      if (res.success) {
        onToast(res.message || '설정이 저장되었습니다.', 'success');
        onEpisodesReload();
        onClose();
      } else {
        onToast('설정 저장에 실패했습니다.', 'error');
      }
    } catch {
      onToast('설정 저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveOAuthCreds = async () => {
    const cid = oauthClientId.trim();
    const sec = oauthClientSecret.trim();
    if (!cid || !sec) {
      onToast('Client ID와 Client Secret을 모두 입력하세요.', 'warn');
      return;
    }
    setSavingCreds(true);
    try {
      const res = await saveGoogleCredentials(cid, sec);
      if (res.success) {
        onToast('Google OAuth 자격 증명이 저장되었습니다.', 'success');
        setOauthClientSecret('');
        setShowOAuthCreds(false);
        const updated = await getGoogleAuthStatus();
        setAuthStatus(updated);
      }
    } catch {
      onToast('OAuth 자격 증명 저장 실패', 'error');
    } finally {
      setSavingCreds(false);
    }
  };

  const handleGoogleLogin = async () => {
    setAuthActionBusy(true);
    try {
      const res = await getGoogleAuthUrl();
      if (!res.success || !res.auth_url) {
        onToast(
          res.error || 'OAuth Client ID가 설정되지 않았습니다. 아래에서 먼저 입력하세요.',
          'warn',
        );
        setShowOAuthCreds(true);
        return;
      }
      window.open(res.auth_url, 'google_oauth', 'width=540,height=680');
    } catch {
      onToast('Google 로그인 URL 생성에 실패했습니다.', 'error');
    } finally {
      setAuthActionBusy(false);
    }
  };

  const handleGoogleLogout = async () => {
    setAuthActionBusy(true);
    try {
      await logoutGoogle();
      const updated = await getGoogleAuthStatus();
      setAuthStatus(updated);
      onSubscriptionsRefresh();
      onToast('Google 계정 연동이 해제되었습니다.', 'info');
    } catch {
      onToast('연동 해제에 실패했습니다.', 'error');
    } finally {
      setAuthActionBusy(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="환경 설정"
      className="fixed inset-0 z-[9000] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-2xl bg-surface border border-line-strong shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-line bg-surface-2/60">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Settings className="w-4 h-4 text-accent" />
            <span>환경 설정</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="설정 닫기"
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-ink-3 hover:text-ink hover:bg-surface-2 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {loading && (
            <div className="flex items-center gap-2 text-xs text-ink-3">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
              <span>설정을 불러오는 중...</span>
            </div>
          )}

          {/* Video Dir */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-ink">
              로컬 미디어 폴더 경로
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={videoDir}
                onChange={(e) => setVideoDir(e.target.value)}
                placeholder="/Users/.../Videos"
                className="flex-1 h-9 px-3 rounded-lg bg-canvas border border-line text-xs font-mono text-ink focus:border-accent focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void handleSelectFolder()}
                disabled={pickingFolder}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-surface-2 hover:bg-line border border-line text-xs font-medium text-ink transition-colors cursor-pointer shrink-0 disabled:opacity-60"
              >
                {pickingFolder ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FolderOpen className="w-3.5 h-3.5 text-ink-2" />
                )}
                <span>폴더 선택</span>
              </button>
            </div>
            <p className="text-[11px] text-ink-3">
              변경 후 저장하면 에피소드 목록을 즉시 다시 불러옵니다.
            </p>
          </div>

          {/* Google / Gemini API Key */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-medium text-ink">
              <KeyRound className="w-3.5 h-3.5 text-accent" />
              <span>Google Gemini API Key</span>
            </label>
            <input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIza... (변경 시 새 키를 입력)"
              className="w-full h-9 px-3 rounded-lg bg-canvas border border-line text-xs font-mono text-ink focus:border-accent focus:outline-none"
            />
            <p className="text-[11px] text-ink-3">
              AI 문맥 사전, 뉘앙스 해설 및 YouTube Data API에 사용됩니다. 마스킹(`***`) 상태면 기존 키가 유지됩니다.
            </p>
          </div>

          {/* Google Account OAuth Section */}
          <div className="rounded-xl bg-canvas border border-line p-3.5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                <Link2 className="w-3.5 h-3.5 text-accent" />
                <span>YouTube 구독 채널 연동 (Google OAuth)</span>
              </div>
              {authStatus?.authenticated ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-good/12 text-good text-[10.5px] font-medium">
                  <CheckCircle2 className="w-3 h-3" />
                  연동됨
                </span>
              ) : (
                <span className="text-[10.5px] text-ink-3">미연동</span>
              )}
            </div>

            {authStatus?.authenticated ? (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="text-xs text-ink-2">
                  <span className="font-medium text-ink">{authStatus.email}</span>
                  <span className="num text-ink-3 ml-1.5">
                    · 구독 채널 {authStatus.channels_count}개
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void handleGoogleLogout()}
                  disabled={authActionBusy}
                  className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-surface hover:bg-danger/10 hover:text-danger border border-line text-[11px] font-medium text-ink-2 transition-colors cursor-pointer"
                >
                  <LogOut className="w-3 h-3" />
                  <span>연동 해제</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleGoogleLogin()}
                    disabled={authActionBusy}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-60"
                  >
                    <span>Google 계정으로 로그인</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowOAuthCreds((v) => !v)}
                    className="h-8 px-2.5 rounded-lg bg-surface-2 hover:bg-line border border-line text-[11px] font-medium text-ink-2 transition-colors cursor-pointer"
                  >
                    {showOAuthCreds
                      ? '자격 증명 접기'
                      : authStatus?.has_client_id
                        ? 'OAuth Client 변경'
                        : 'OAuth Client 등록'}
                  </button>
                </div>

                {showOAuthCreds && (
                  <div className="space-y-2 pt-1 border-t border-line">
                    <input
                      type="text"
                      value={oauthClientId}
                      onChange={(e) => setOauthClientId(e.target.value)}
                      placeholder="Google OAuth Client ID"
                      className="w-full h-8 px-2.5 rounded-lg bg-surface border border-line text-xs font-mono text-ink focus:border-accent focus:outline-none"
                    />
                    <input
                      type="password"
                      value={oauthClientSecret}
                      onChange={(e) => setOauthClientSecret(e.target.value)}
                      placeholder="Google OAuth Client Secret"
                      className="w-full h-8 px-2.5 rounded-lg bg-surface border border-line text-xs font-mono text-ink focus:border-accent focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => void handleSaveOAuthCreds()}
                      disabled={savingCreds}
                      className="h-8 px-3 rounded-lg bg-surface-2 hover:bg-line border border-line text-xs font-medium text-ink transition-colors cursor-pointer"
                    >
                      {savingCreds ? '저장 중...' : 'OAuth 자격 증명 저장'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Log Path */}
          {logPath && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-ink-3">
                <Terminal className="w-3 h-3" />
                <span>백엔드 로그 경로</span>
              </div>
              <div className="px-3 py-2 rounded-lg bg-canvas border border-line font-mono text-[11px] text-ink-2 break-all select-all">
                {logPath}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-3.5 rounded-lg bg-surface-2 hover:bg-line border border-line text-xs font-medium text-ink-2 transition-colors cursor-pointer"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>설정 저장</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
