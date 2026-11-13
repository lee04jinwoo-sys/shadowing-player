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

## 5. 구조 리팩토링, 버그 수정 및 마감 (2차 패스)
- **커스텀 훅 분리 (`App.tsx` 1,279줄 -> 676줄)**:
  - `hooks/useToast.ts` (16줄): 토스트 알림 상태 및 자동 소멸 타이머 관리.
  - `hooks/useEpisodeCollections.ts` (176줄): 에피소드별 받아쓰기·추출 문장·단어·완료 상태 및 최근 YouTube 기록 통합 관리. state updater 내부 `saveStoredState()` side-effect 및 일괄 추출 중 stale closure를 제거하고 `dirtyRef` + `useEffect` 저장으로 일원화.
  - `hooks/useMediaPlayer.ts` (435줄): HTML5 `<video>` 및 YouTube IFrame 재생·구간 반복(A-B)·재생속도·스크러빙·로컬/유튜브 소스 전환 초기화(`clearHtml5Video`) 통합 제어.
  - `hooks/useKeyboardShortcuts.ts` (192줄): 전역 단축키(`Space`, `←/→`, `R`, `V`, `A`, `F`, `?` 등) 및 입력 포커스 가드 처리.
- **레이아웃 계층 및 시각 정제**:
  - `MediaContextBar`를 헤더 아래 전폭 2단 스트립에서 좌측 스테이지 컬럼 내 `VideoStage` 상단 `.card-surface` 카드로 이동해 상단 경계선 누적을 줄이고 `Sidebar`가 헤더 아래 전체 높이를 점유하도록 정리.
  - `index.css`에 `:root[data-theme="light"] .card-surface` 그림자와 `@keyframes skeleton-shimmer` / `.skeleton` 유틸리티 추가, `ExploreView`/`ListeningPanel` 로딩 스켈레톤 적용.
  - `Header` 활성 에피소드 배지 표시 기준을 `xl:`에서 `lg:`로 확장(`max-w-[260px]`), `DictationPanel` `'다시 시도'` 재입력 버튼, `VideoStage` 타임라인 슬라이더 키보드(`ArrowLeft`/`ArrowRight`/`Home`/`End`) 지원, `ListeningPanel` 자막 행 키보드(`Enter`/`Space`) 탐색, `DictPopover` 스크롤 자동 닫힘 적용.
- **버그 및 접근성 수정**:
  - `utils/subtitles.ts`: `decodeHtmlEntities()` 추가로 자막 토큰화 전 Named/Numeric HTML 엔티티(`&amp;`, `&#39;` 등) 디코딩.
  - `App.tsx`: `YouTube` -> `로컬` 전환 시 stale YouTube 자막/미디어를 정리하고 첫 로컬 에피소드 자동 로드.
  - `ExploreView.tsx`: Google 미연동 상태에서도 `DEFAULT_ENGLISH_CHANNELS` 추천 채널 칩을 노출하고 `"Google 계정 연동하기"` 버튼을 병기. 채널 썸네일 없을 때 폴백 이니셜 `<span>`에 `aria-hidden="true"`를 부여해 버튼 접근성 이름 오염(`"T TED-Ed"`) 제거.
- **검증 현황**: Vitest `7`파일 `18`개 테스트 통과, `tsc -b && vite build` 통과, `pytest -q` `35`개 테스트 통과, 로컬 서버(`127.0.0.1:8080`) 실브라우저 점검 완료.

## 6. Warm Cinema & Editorial 디자인 리뉴얼 (3차 패스)
- **설계 기준 합의 (`/grill-me` 5단계)**:
  - **색상/토큰 시스템 (`index.css`)**: 다크 기본 팔레트를 웜 시네마/에디토리얼 톤(캔버스 `#0a0d14`, 표면 `#0f131c`, 보조 표면 `#161b26`/`--surface-3` `#1d2331`, 시네마 스테이지 `#07090f`, 웜 골드 포인트 `#f5c26b` + 고대비 텍스트 `--accent-ink: #0a0d14`)으로 재정립하고, 라이트 모드(`#f8fafc` 캔버스, `#ffffff` 표면, `#f1f5f9` 보조 표면, `#0c101a` 스테이지)는 대비가 높은 `#b45309` 포인트 + `#ffffff` `--accent-ink`로 보정.
  - **글로벌 대비 규칙**: `bg-accent` 채움 버튼에 남아있던 `text-white`를 전 컴포넌트(`Header`, `MediaContextBar`, `VideoStage`, `ListeningPanel`, `DictationPanel`, `ExtractionPanel`, `ExploreView`, `DictPopover`, `SettingsModal`)에서 `text-accent-ink`로 일괄 교체.
- **프레임 통합 및 Box-in-Box 제거**:
  - `Header.tsx`: 데스크톱 `md:h-12` 슬림 높이, `/ activeTitle` 표시, 보더 없는 `bg-surface-2` 소스 탭 및 고스트 유틸리티 버튼, 검사 중 스피너와 상태 도트가 겹치지 않는 단일 Anki 상태 인디케이터 적용.
  - `App.tsx` + `MediaContextBar.tsx` + `VideoStage.tsx`: `!theaterMode`에서 미디어 컨텍스트 바·비디오 스테이지·NLE 트랜스포트 독을 단일 `rounded-2xl border border-line bg-surface overflow-hidden divide-y divide-line` 프레임으로 통합해 중첩 보더 제거.
- **플레이어 워크스페이스 고도화 (`MediaContextBar.tsx`, `VideoStage.tsx`)**:
  - OS 기본 `<select>`를 바깥 클릭 및 `Escape` 키로 닫히는 커스텀 `aria-haspopup="listbox"` / `role="listbox"` 드롭다운(로컬 에피소드 및 YouTube 최근 기록)으로 교체.
  - 초기 검은 정지 프레임 공백을 줄이기 위해 미디어 로드 후 `currentTimeMs < 500 && !isPlaying`일 때 중앙 스탠바이 재생 트리거(`aria-label="영상 재생 시작"`) 제공.
  - NLE 타임라인 스크러버에 샘플링된 자막 큐 틱 레일(`data-testid="cue-ticks-rail"`)과 호버 시점/자막 프리뷰(`data-testid="scrubber-hover-tip"`)를 추가하되, `dictationModeActive` 활성화 시 영어 자막 텍스트 유출을 차단.
- **우측 사이드바 리듬 정제 (`Sidebar.tsx`, `ListeningPanel.tsx`, `DictationPanel.tsx`, `ExtractionPanel.tsx`)**:
  - `ListeningPanel`: `[52px_1fr]` `divide-y` 에디토리얼 행, 좌측 활성/추출/별표 얇은 강조 바, 고스트 호버 액션 적용.
  - `DictationPanel` / `ExtractionPanel`: 이중 카드 보더를 `divide-y divide-line` 및 `bg-canvas/55` 계층으로 평탄화해 시각적 과밀 해소.
- **TDD Red->Green & 검증 현황**:
  - 신규/확장 테스트(`MediaContextBar.test.tsx`, `VideoStage.test.tsx`, `DictationPanel.test.tsx`) 선작성 후 실패 확인(Red: `3 files failed / 3 tests failed`) 뒤 구현 완료.
  - 최종 검증: Vitest `8`파일 `20`개 테스트 통과, `tsc -b && vite build` 통과, `pytest -q` `35`개 테스트 통과.

## 7. 인디고(남색) 포인트 컬러 복원 (4차 패스)
- **사유 및 트레이드오프**: 3차 패스에서 적용한 Warm Amber(`#f5c26b` / `#b45309`)가 라이트 모드 등에서 주황 계열로 인식된다는 피드백에 따라, 기존 `758cc6d`의 인디고/남색 포인트 토큰을 복원하되 3차 패스의 `--accent-ink` 고대비 체계를 유지.
- **토큰 조정 (`index.css`)**:
  - **다크**: `--accent: #8b93ff`, `--accent-hover: #757ef5`, `--accent-ink: #0a0d14`(WCAG 대비 `7.14:1`, 기존 흰 글씨 `2.72:1` 대비 개선), `--warn: #fbbf24`.
  - **라이트**: `--accent: #5b63e6`, `--accent-hover: #4b53d1`, `--accent-ink: #ffffff`(대비 `4.8:1`), `--warn: #d97706`.
- **검증 현황**: `themeTokens.test.ts` Red->Green 포함 Vitest `9`파일 `21`개 테스트 통과, `tsc -b && vite build` 통과, `pytest -q` `35`개 테스트 통과.
