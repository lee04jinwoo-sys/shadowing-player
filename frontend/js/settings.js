import { fetchSettings, saveSettings, fetchLogPath, selectFolder, getGoogleAuthStatus, getGoogleAuthUrl, logoutGoogle, saveGoogleDirectToken, saveGoogleCredentials } from './api.js';

let settingsModal = null;
let apiKeyInput = null;
let videoDirInput = null;
let ankiUrlInput = null;
let logPathInput = null;
let apiKeyToggleBtn = null;
let selectFolderBtn = null;
let saveBtn = null;
let cancelBtn = null;
let closeBtn = null;
let copyLogBtn = null;

let googleStatusBadge = null;
let googleAuthBtn = null;
let googleAuthBtnText = null;
let googleClientIdInput = null;
let googleClientSecretInput = null;
let saveGoogleCredsBtn = null;

let isKeyMasked = true;
let currentRawKey = "";

export function initSettingsModal() {
  settingsModal = document.getElementById("settings-modal");
  if (!settingsModal) return;

  apiKeyInput = document.getElementById("settings-api-key");
  videoDirInput = document.getElementById("settings-video-dir");
  ankiUrlInput = document.getElementById("settings-anki-url");
  logPathInput = document.getElementById("settings-log-path");
  apiKeyToggleBtn = document.getElementById("settings-key-toggle-btn");
  selectFolderBtn = document.getElementById("settings-select-folder-btn");
  saveBtn = document.getElementById("settings-save-btn");
  cancelBtn = document.getElementById("settings-cancel-btn");
  closeBtn = document.getElementById("settings-close-btn");
  copyLogBtn = document.getElementById("settings-copy-log-btn");

  googleStatusBadge = document.getElementById("settings-google-status-badge");
  googleAuthBtn = document.getElementById("settings-google-auth-btn");
  googleAuthBtnText = document.getElementById("settings-google-auth-btn-text");
  googleClientIdInput = document.getElementById("settings-google-client-id");
  googleClientSecretInput = document.getElementById("settings-google-client-secret");
  saveGoogleCredsBtn = document.getElementById("settings-save-google-creds-btn");

  const settingsTriggerBtn = document.getElementById("settings-btn");
  if (settingsTriggerBtn) {
    settingsTriggerBtn.addEventListener("click", openSettingsModal);
  }

  if (closeBtn) closeBtn.addEventListener("click", closeSettingsModal);
  if (cancelBtn) cancelBtn.addEventListener("click", closeSettingsModal);
  if (saveBtn) saveBtn.addEventListener("click", handleSaveSettings);

  if (googleAuthBtn) {
    googleAuthBtn.addEventListener("click", handleGoogleAuthClick);
  }

  if (saveGoogleCredsBtn) {
    saveGoogleCredsBtn.addEventListener("click", async () => {
      const cid = googleClientIdInput ? googleClientIdInput.value.trim() : "";
      const sec = googleClientSecretInput ? googleClientSecretInput.value.trim() : "";
      if (!cid) {
        showSettingsToast("Google Client ID를 입력해 주세요.");
        return;
      }
      try {
        await saveGoogleCredentials(cid, sec);
        showSettingsToast("Google OAuth 설정이 저장되었습니다. 이제 [Google 로그인]을 눌러주세요.");
      } catch (e) {
        alert("OAuth 설정 저장 실패: " + e.message);
      }
    });
  }

  // Listen for OAuth popup completion
  window.addEventListener("message", (e) => {
    if (e.data && e.data.type === 'GOOGLE_AUTH_SUCCESS') {
      updateGoogleAuthStatus();
      if (window._refreshSubscriptions) window._refreshSubscriptions();
    }
  });

  // Native macOS Folder Picker handler
  if (selectFolderBtn) {
    selectFolderBtn.addEventListener("click", async () => {
      try {
        selectFolderBtn.disabled = true;
        selectFolderBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 16px;">hourglass_top</span>선택 중...';
        const res = await selectFolder();
        if (res && res.folder_path) {
          if (videoDirInput) {
            videoDirInput.value = res.folder_path;
          }
          const folderName = res.folder_path.split('/').filter(Boolean).pop() || res.folder_path;
          showSettingsToast(`폴더가 선택되었습니다: ${folderName}`);
        }
      } catch (err) {
        console.error("Folder picker error:", err);
      } finally {
        selectFolderBtn.disabled = false;
        selectFolderBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 16px;">folder_open</span>폴더 선택';
      }
    });
  }

  if (apiKeyToggleBtn) {
    apiKeyToggleBtn.addEventListener("click", () => {
      isKeyMasked = !isKeyMasked;
      apiKeyInput.type = isKeyMasked ? "password" : "text";
      apiKeyToggleBtn.textContent = isKeyMasked ? "visibility" : "visibility_off";
    });
  }

  if (copyLogBtn) {
    copyLogBtn.addEventListener("click", () => {
      if (logPathInput && logPathInput.value) {
        navigator.clipboard.writeText(logPathInput.value);
        showSettingsToast("로그 파일 경로가 클립보드에 복사되었습니다.");
      }
    });
  }

  // Close on backdrop click
  settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) {
      closeSettingsModal();
    }
  });

  // Close on ESC
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && settingsModal.style.display === "flex") {
      closeSettingsModal();
    }
  });
}

export async function openSettingsModal() {
  if (!settingsModal) return;
  settingsModal.style.display = "flex";

  try {
    const [settings, logInfo] = await Promise.all([
      fetchSettings().catch(() => ({})),
      fetchLogPath().catch(() => ({})),
      updateGoogleAuthStatus().catch(() => ({}))
    ]);

    if (apiKeyInput) {
      apiKeyInput.value = settings.google_api_key || "";
      currentRawKey = settings.google_api_key || "";
    }
    if (videoDirInput) {
      videoDirInput.value = settings.video_dir || "";
    }
    if (ankiUrlInput) {
      ankiUrlInput.value = settings.anki_url || "http://localhost:8765";
    }
    if (logPathInput) {
      logPathInput.value = logInfo.log_path || "";
    }
  } catch (err) {
    console.error("Failed to load settings:", err);
  }
}

export async function updateGoogleAuthStatus() {
  if (!googleStatusBadge) return;
  try {
    const status = await getGoogleAuthStatus();
    if (status.authenticated) {
      googleStatusBadge.innerHTML = `
        <span style="color: #4ade80; font-weight: 600;">연동 완료</span>
        <span style="color: var(--text-muted); margin-left: 6px;">(영어 채널 ${status.channels_count}개 발견)</span>
      `;
      if (googleAuthBtnText) googleAuthBtnText.textContent = "연동 해제";
      if (googleAuthBtn) {
        googleAuthBtn.classList.remove("primary");
        googleAuthBtn.classList.add("secondary");
      }
    } else {
      googleStatusBadge.innerHTML = `
        <span style="color: var(--text-muted);">미연동 (Google 계정을 연결하여 구독 채널 동기화)</span>
      `;
      if (googleAuthBtnText) googleAuthBtnText.textContent = "Google 로그인";
      if (googleAuthBtn) {
        googleAuthBtn.classList.remove("secondary");
        googleAuthBtn.classList.add("primary");
      }
    }
    return status;
  } catch (err) {
    console.error("Failed to check Google auth status:", err);
  }
}

async function handleGoogleAuthClick() {
  try {
    const status = await getGoogleAuthStatus();
    if (status.authenticated) {
      if (confirm("Google 계정 연동을 해제하시겠습니까?")) {
        await logoutGoogle();
        showSettingsToast("Google 계정 연동이 해제되었습니다.");
        updateGoogleAuthStatus();
        if (window._refreshSubscriptions) window._refreshSubscriptions();
      }
    } else {
      const urlRes = await getGoogleAuthUrl();
      if (urlRes && urlRes.success && urlRes.auth_url) {
        window.open(urlRes.auth_url, 'google_login_popup', 'width=580,height=700,menubar=no,toolbar=no');
      } else {
        if (googleClientIdInput) googleClientIdInput.focus();
        showSettingsToast("아래 Google Client ID를 먼저 입력하고 [저장]을 눌러주세요.");
      }
    }
  } catch (err) {
    alert("Google 계정 연동 실패: " + err.message);
  }
}

export function closeSettingsModal() {
  if (!settingsModal) return;
  settingsModal.style.display = "none";
}

async function handleSaveSettings() {
  if (!saveBtn) return;
  saveBtn.disabled = true;
  saveBtn.textContent = "저장 중...";

  try {
    const newApiKey = apiKeyInput ? apiKeyInput.value.trim() : "";
    const newVideoDir = videoDirInput ? videoDirInput.value.trim() : "";
    const newAnkiUrl = ankiUrlInput ? ankiUrlInput.value.trim() : "";

    const payload = {
      anki_url: newAnkiUrl || "http://localhost:8765"
    };

    // Only update API key if user changed it from masked value
    if (newApiKey && !newApiKey.includes("***")) {
      payload.google_api_key = newApiKey;
    }

    if (newVideoDir) {
      payload.video_dir = newVideoDir;
    }

    const res = await saveSettings(payload);
    showSettingsToast("설정이 성공적으로 저장되었습니다.");
    closeSettingsModal();

    // If video dir changed, trigger reload if possible
    if (newVideoDir && window._reloadEpisodes) {
      window._reloadEpisodes();
    }
  } catch (err) {
    alert("설정 저장 실패: " + err.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "설정 저장";
  }
}

function showSettingsToast(msg) {
  let toast = document.getElementById("settings-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "settings-toast";
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #1e1b4b;
      color: #fff;
      padding: 12px 20px;
      border-radius: 8px;
      border: 1px solid #6366f1;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
      font-size: 13px;
      font-weight: 500;
      z-index: 99999;
      display: flex;
      align-items: center;
      gap: 8px;
      animation: fadeIn 0.2s ease;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.display = "flex";

  setTimeout(() => {
    if (toast) toast.style.display = "none";
  }, 3000);
}
