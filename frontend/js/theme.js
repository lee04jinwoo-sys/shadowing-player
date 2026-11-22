const STORAGE_KEY = "theme";

function systemPrefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function isDark() {
  const root = document.documentElement;
  const explicit = root.dataset.theme;
  return explicit ? explicit === "dark" : systemPrefersDark();
}

function syncToggleIcon(btn) {
  const icon = btn.querySelector(".material-symbols-outlined");
  if (icon) icon.textContent = isDark() ? "light_mode" : "dark_mode";
  btn.title = isDark() ? "라이트 모드로 전환" : "다크 모드로 전환";
}

export function initThemeToggle() {
  const btn = document.getElementById("theme-toggle-btn");
  if (!btn) return;
  syncToggleIcon(btn);
  btn.addEventListener("click", () => {
    const next = isDark() ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(STORAGE_KEY, next); } catch (e) { /* storage blocked */ }
    syncToggleIcon(btn);
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => syncToggleIcon(btn));
}
