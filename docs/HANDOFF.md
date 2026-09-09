# 중간에서 보자 — 프로젝트 핸드오프 (Claude Code 이관용)

> 마지막 갱신: 2026-09-09 · 이 문서는 새 Claude Code 세션이 맥락을 빠르게 잡도록 정리한 인수인계 노트다. 작업 시작 전에 이 문서를 먼저 읽을 것.

## 1. 이게 뭔가
- **B2C 웹 도구**: 모임 참여자들의 출발지를 넣으면 **가장 공평한 중간 지하철역**을 추천한다.
- 만든 사람: Jude(전범주). **개인 사이드 프로젝트**이자 "빠르게 만들고 배포하는" 연습(rep) #1 — 회사 업무와 별개.
- 목표: 기능 ①~⑦까지 올려 "하나의 완성된 repo"를 만들고, 인프로덕트 유통 루프까지 붙인다.

## 2. 라이브 / 저장소 / 배포
- Repo: `github.com/devcatebum-kr/meet-middle` (public)
- 배포: **Netlify** — https://idyllic-pasca-95ae55.netlify.app
- CD: GitHub `main`에 push하면 Netlify가 **자동 배포**(~1분). 별도 빌드 스텝 없음(정적 + Functions).

## 3. 아키텍처 / 스택
- **프론트: 순수 바닐라 JS SPA.** (TypeScript/NestJS 안 씀 — 이 규모엔 오버킬이라 의도적으로 배제.)
  - `index.html` — 뷰 셸(home / room / results 세 섹션 토글). 정적 OG 태그 포함.
  - `app.js` — 앱 로직 전부(약 398줄, 하나의 IIFE). 아래 4절 참고.
  - `styles.css` — 스타일(다크모드 대응).
  - `config.js` — `window.APP_CONFIG = { KAKAO_JS_KEY: "..." }` (Kakao JS 키, 도메인 잠금 public key).
- **지도/장소: Kakao Maps JS SDK** (`libraries=services`). 지하철역 `SW8`, 카페 `CE7`, 음식 `FD6` 카테고리 + keywordSearch/categorySearch.
- **서버리스: Netlify Functions v2 (ESM `.mjs`)** + **Netlify Blobs**(방 상태·캐시 저장).
  - `netlify/functions/room.mjs` → `/api/room` : 방 생성(POST)/조회(GET). 참여자 prefix `${roomId}:p:`.
  - `netlify/functions/participant.mjs` → `/api/participant` : 참여자 upsert(POST)/삭제(DELETE). 키 `${roomId}:p:${id}`.
  - `netlify/functions/fairness.mjs` → `/api/fairness` : **ODsay 대중교통 시간** 계산. Blobs 캐시(좌표 소수 3자리 반올림 ≈110m, 60일 TTL) + **minimax 공평 정렬** + 실패 시 직선거리 폴백.
  - `netlify/functions/share.mjs` → `/s` : 카톡 공유용 **OG 카드 서버 렌더** 후 앱으로 리다이렉트. 두 종류를 받는다 — `?room=` (방 초대, 참여자 수를 카드에 표시) / `?r=` (결과 링크, payload를 디코드해 인원·이름을 카드에 표시 후 앱의 `#r=`로 되돌림). 해시는 서버로 안 가므로 공유 링크는 반드시 `/s`를 거쳐야 카드가 뜬다.

## 4. app.js 핵심 흐름
- `boot()` : Kakao 지도 SDK + Kakao 공유 SDK 로드, `Kakao.init(key)`, `route()`.
- `route()` : `?room=` → `enterRoom(id, invited=true)` / `#r=` → `renderShared()` / else → `showHome()`.
- `enterRoom(roomId, invited)` : 방 뷰. `invited`면 초대 배너 표시. 공유링크 `origin + "/s?room=" + id`. 카톡 초대 버튼(`shareInvite`) 연결. **가시성 기반 폴링**(`document.hidden`이면 skip, 5초, visibilitychange 시 즉시 갱신).
- `shareInvite(link)` : Kakao.Share 원탭 → `navigator.share` → 클립보드 복사 순 폴백.
- `compute(people)` : centroid 근처 지하철역 후보 → **ODsay 쿼터 절약 위해 top3만** `/api/fairness`에 보냄 → 결과 렌더 + 역 근처 카페/음식 → 카톡 텍스트/결과링크(`/s?r=`) 생성.
- payload 인코딩은 **base64url**(`b64e`/`b64d`) — 쿼리에 실려도 안전. 구버전 표준 base64 `#r=` 링크도 그대로 디코드된다.
- 공평 기준: **minimax**(가장 오래 걸리는 사람 최소화, 동률이면 총합).

## 5. 환경변수 (Netlify 대시보드에 설정됨)
- `ODSAY_API_KEY` — ODsay 대중교통 API 키.
- `ODSAY_REFERER` — `https://idyllic-pasca-95ae55.netlify.app` (ODsay가 도메인 제한 → 서버 호출 시 이 Referer 헤더 필요).

## 6. 외부 API 주의사항
- **ODsay**: 무료 Basic = **30콜/일 하드캡**. 그래서 (a) Blobs 캐시, (b) 후보 역 top3 제한을 반드시 유지. 좌표는 `X=경도(lng), Y=위도(lat)` 순서.
- **Kakao**: 카카오맵 product 활성화 필요, JS 키는 도메인 등록(프로토콜 없이 도메인만). 무료 일일 쿼터 내.

## 7. 현재 상태 (완료)
- 기능 ①만남장소 추천 ②결과 공유링크 ③길찾기 딥링크 ④입력 UX ⑤인당 거리/시간 표시 ⑥대중교통 시간 기반 공평 ⑦협업 방 — **구현 완료**.
- **유통 1차**: 방 뷰에 카톡 초대 버튼 + "초대받았어요" 배너 + `enterRoom(invited)` + `shareInvite()` + `/s` OG 카드. **완료**.
- **결과 링크 OG 카드**: `#r=` → `/s?r=` 전환, share.mjs가 payload를 디코드해 "N명의 중간지점 · 이름들" 카드 렌더. `/s`는 `noindex`(공유 링크에 이름·출발지가 담기므로). **완료**.
- **og:image**: `og.png`(1200×630) + index.html·share.mjs 배선, `twitter:card=summary_large_image`. **완료**.
  - 원본은 `docs/og-source.html`. 수정 후 아래로 다시 굽는다:
    ```bash
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
      --hide-scrollbars --force-device-scale-factor=1 --screenshot=og.png \
      --window-size=1200,630 file://$PWD/docs/og-source.html
    ```
  - 이미지를 교체하면 index.html·share.mjs의 `?v=1` 을 올려야 카톡 스크래퍼 캐시가 갱신된다.
- **경쟁사 스캔**: 7곳 직접 확인 → `docs/competitors.md`. 요지 — **링크로 각자 입력하는 협업 방을 가진 곳이 0곳**, minimax를 말하는 곳도 0곳, 카테고리 자체가 작음(최대 1만+ 다운). 가장 가까운 건 쌤밋(대중교통 기준+카톡 공유, 방 없음). **완료**.
- **퍼널 계측**: `netlify/lib/stats.mjs` — 기존 핸들러 안에서 하루치 블롭 하나를 조건부 쓰기(etag)로 증가시킨다. **함수 호출이 늘지 않는다.** 조회는 `GET /api/stats`(`?format=text`, `?days=N`). `STATS_TOKEN` 환경변수를 설정하면 `?t=` 없이는 못 본다(미설정 시 공개).
  - 이벤트: `room_created` / `invite_scraped`(카톡이 카드를 만듦 = 초대가 전송됨) / `invite_viewed`(사람이 열람) / `participant_joined` · `participant_updated` · `participant_removed` / `result_viewed` · `result_scraped` / `fairness_run` / `odsay_call` · `odsay_ok` · `odsay_cache_hit`.
  - **봇 판별 주의**: 카톡 인앱 브라우저(사람)의 UA 에도 `KAKAOTALK` 이 들어간다. 스크래퍼는 `kakaotalk-scrap` 으로만 구분해야 하며, 그냥 `kakaotalk` 을 매칭하면 실제 사용자가 전부 봇으로 잡혀 퍼널이 0이 된다.
  - `/s?room=` 은 `no-store` 로 바꿨다 — 참여자 수가 실시간으로 바뀌는 카드라 캐시가 원래 틀렸고, 캐시되면 열람 집계도 샌다. `/s?r=` 은 내용이 고정이라 5분 캐시 유지.
  - 하루 경계는 KST. ODsay 30콜/일 잔량도 `/api/stats` 의 `odsay.today_calls` 로 본다.
- **초대·OG 카피 1차**: 접점마다 "할 일 하나"만 남기는 방향으로 정리(카톡 메시지 / 초대 배너 / 방 힌트 / 홈 CTA / OG 문구). 방 카드 제목은 인원이 있으면 `N명이 모이는 중` — 사회적 증거가 참여 이유가 되므로. 푸터의 개인 메모(`rep #1 …`)는 데이터 출처 표기로 교체. **완료**.
- 성능/비용: ODsay Blobs 캐시, 가시성 기반 폴링, 후보 top3 제한. 광고 수익 배선은 **인지만, 테스트 기간이라 보류**.

## 8. 다음 할 일 (미착수)
- **포지셔닝 반영**(스캔에서 나온 것, `docs/competitors.md`): ①히어로를 솔로가 아니라 **방 중심**으로 — "링크 하나 보내면 각자 자기 위치만" 이 문장은 우리만 쓸 수 있는데 지금 홈 CTA에만 있다. ②**minimax를 카피로** — 결과의 `최대 N분` 배지를 앞세우기. 아무도 안 쓰는 말이라 그 자체가 포지션.
- 동적 og:image: 결과 카드 그림에 인원수·역 이름을 그려 넣기. 서버 PNG 렌더는 의존성(satori/resvg)이 붙어 **바닐라 유지 원칙과 트레이드오프** — 지금은 전 페이지 공용 1장.
- 시딩: 오픈채팅/소모임/문토 등 커뮤니티 시딩용 카피(콘텐츠 마케팅 방식은 Jude가 선호 안 함 → 인프로덕트 초대 루프 우선).

## 9. 개발 워크플로 (중요)
- **이 repo 작업은 Claude Code(claude.ai/code 또는 CLI)에서 repo 바운드로** 한다 → `git commit`/`push` 네이티브로 몇 초.
- 커밋은 작은 단위로. `main` push → Netlify 자동배포.
- 바닐라 JS 유지(불필요한 프레임워크 도입 금지). ODsay 쿼터 절약 로직(캐시·top3) 건드리지 말 것.
- 참고: Cowork 세션에서는 이 git 루프가 막혀 있어(세션이 컴퓨터 바운드, git 기능 off) 브라우저 우회를 해야 했음 — 그래서 Claude Code로 이관.

## 10. 파일 트리
```
meet-middle/
├─ index.html
├─ app.js
├─ og.png              # 공유 카드 썸네일 1200×630 (docs/og-source.html 에서 구움)
├─ styles.css
├─ config.js            # KAKAO_JS_KEY (public, 도메인 잠금)
├─ netlify.toml
├─ package.json         # @netlify/blobs, type: module
├─ netlify/
│  ├─ lib/stats.mjs     # 퍼널 카운터(공용) — 봇 판별 + KST 일자 키
│  └─ functions/
│     ├─ room.mjs          # /api/room
│     ├─ participant.mjs   # /api/participant
│     ├─ fairness.mjs      # /api/fairness (ODsay + Blobs 캐시 + minimax)
│     ├─ share.mjs         # /s (OG 카드)
│     └─ stats.mjs         # /api/stats (퍼널 조회)
└─ docs/
   ├─ HANDOFF.md        # 이 문서
   ├─ og-source.html    # og.png 원본 (헤드리스 크롬으로 스크린샷)
   └─ competitors.md    # 경쟁사 스캔 (2026-09-09)
```
