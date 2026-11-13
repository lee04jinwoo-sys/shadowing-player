# Shadowing Player Frontend Overhaul (2026-11)

## 1. 아키텍처 전환 요약
- **스택**: Vanilla JS/CSS (`frontend/js/*`, `frontend/css/*`) -> React 19 + TypeScript (strict) + Tailwind CSS v4 (`@tailwindcss/vite`) + Lucide React.
- **타이포그래피 & 테마 토큰**:
  - `Pretendard Variable` + `JetBrains Mono` (`.num` tabular-nums 적용).
  - Dark 기본값 + Light 테마 전환 (`:root[data-theme="light"]`, `localStorage['shadowing_theme']` 기반 pre-paint 스크립트로 초기 깜빡임 방지).
  - 공용 컬러 토큰: `--canvas`, `--surface`, `--surface-2`, `--line`, `--line-strong`, `--ink`, `--ink-2`, `--ink-3`, `--accent`, `--good`, `--warn`, `--danger`, `--info`.

## 2. 주요 레이아웃 및 컴포넌트
- **Header (`Header.tsx`)**: `1fr auto 1fr` sticky 헤더(상단 macOS traffic-light 여백 제거), 3-way 소스 전환(`로컬` / `YouTube` / `탐색`), Anki 연결 상태 배지, 단축키/설정/테마 전환 버튼.
- **Media Context Bar (`MediaContextBar.tsx`)**: 로컬 에피소드 선택·새로고침·온라인 자막 검색·완료 토글 및 YouTube URL 입력/최근 기록 바.
- **Video Stage (`VideoStage.tsx`)**: HTML5 `<video>` 및 YouTube IFrame 어댑터, 커스텀 대사 진행률 스크러버, A-B 구간 반복(`R`), EN/KR 오버레이 토글, 재생속도 슬라이더(`0.5x–2.0x`), 극장 모드(`F`/`ㄹ`) 플로팅 컨트롤.
- **Sidebar (`Sidebar.tsx` + 3개 학습 패널)**: 데스크톱 너비 드래그 조절(`320px–560px`), 리스닝 자막 리스트/블러(`V`), 말하기(받아쓰기 + Web Speech STT + Gemini AI 해설), Anki 문장/단어 추출(`.apkg`/`.csv`/Anki 일괄 전송).
- **DictPopover (`DictPopover.tsx`)**: React Portal 기반 문맥 사전 팝오버, 단일/Shift 범위/드래그 구문 조회, TTS 발음 재생, 인라인 수정 및 Anki/로컬 대기열 보관(`A`/`ㅁ`).
- **Explore & Modals (`ExploreView.tsx`, `SettingsModal.tsx`, `ShortcutsModal.tsx`)**: 8개 큐레이션 태그 및 Google OAuth 구독 채널 연동 탐색 뷰, API 키/폴더 선택/OAuth/단축키 안내 모달.

## 3. 백엔드 서빙 변경 (`server.py`)
- `frontend/dist/assets` 정적 마운트(`/assets`), 루트(`/`) 및 SPA Fallback(`/{full_path:path}`) 추가.
- `/api` 및 `/api/*` 경로는 SPA fallback에서 제외해 404를 그대로 반환하며, HTML/JS/CSS/assets 응답에 `Cache-Control: no-cache` 헤더를 유지.

## 4. 시행착오 및 트러블슈팅 기록
- **Node v25 `localStorage` 스텁 충돌**: Vitest jsdom 환경에서 Node 25 기본 `--localstorage-file` 미지정 시 `localStorage.clear`가 함수가 아닌 오류가 발생해 `src/test/setup.ts`에 `Storage` 메모리 폴리필 조건부 주입으로 해결.
- **접근성 이름 중복**: `MediaContextBar.tsx`의 아이콘 전용 새로고침 버튼이 `title="로컬 폴더 다시 스캔"`으로 fallback되어 헤더의 `로컬` 탭과 버튼 쿼리가 충돌 -> `aria-label="에피소드 목록 새로고침"` 명시로 해소.
- **HTML5 / YouTube IFrame 수명주기**: `YT.Player`가 대상 DOM 노드를 iframe으로 치환하므로 `ytHostRef` 내부에 동적 `#yt-iframe-target`을 생성·파기하도록 분리해 React DOM reconciliation 충돌 방지.
