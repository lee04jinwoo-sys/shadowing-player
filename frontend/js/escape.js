// innerHTML에 넣는 모든 외부 문자열(YouTube 제목, 자막, AI 응답, 저장된 단어)은 이걸 거친다.
const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);
}
