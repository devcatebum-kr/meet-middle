# 중간에서 보자 — 프로젝트 핸드오프 (Claude Code 이관용)

> 마지막 갱신: 2026-09-09 (2차) · 이 문서는 새 Claude Code 세션이 맥락을 빠르게 잡도록 정리한 인수인계 노트다. 작업 시작 전에 이 문서를 먼저 읽을 것.

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
- `STATS_TOKEN` — 퍼널 조회 토큰. **설정 전까지 `/api/stats` 는 404.** 아무 긴 랜덤 문자열이면 된다.

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
- **퍼널 계측**: `netlify/functions/_shared/stats.mjs` — 기존 핸들러 안에서 하루치 블롭 하나를 조건부 쓰기(etag)로 증가시킨다. **함수 호출이 늘지 않는다.** 조회는 `GET /api/stats`(`?format=text`, `?days=N`) — **운영자 전용, fail-closed**. Netlify 대시보드에 `STATS_TOKEN` 을 넣고 `?t=<토큰>` 으로만 열린다. **토큰을 설정하기 전까지는 404** (저장소가 public 이라 엔드포인트 주소가 이미 공개돼 있기 때문).
  - 이벤트: `room_created` / `invite_scraped`(카톡이 카드를 만듦 = 초대가 전송됨) / `invite_viewed`(사람이 열람) / `participant_joined` · `participant_updated` · `participant_removed` / `result_viewed` · `result_scraped` / `fairness_run` / `odsay_call` · `odsay_ok` · `odsay_cache_hit`.
  - **봇 판별 주의**: 카톡 인앱 브라우저(사람)의 UA 에도 `KAKAOTALK` 이 들어간다. 스크래퍼는 `kakaotalk-scrap` 으로만 구분해야 하며, 그냥 `kakaotalk` 을 매칭하면 실제 사용자가 전부 봇으로 잡혀 퍼널이 0이 된다.
  - `/s?room=` 은 `no-store` 로 바꿨다 — 참여자 수가 실시간으로 바뀌는 카드라 캐시가 원래 틀렸고, 캐시되면 열람 집계도 샌다. `/s?r=` 은 내용이 고정이라 5분 캐시 유지.
  - 하루 경계는 KST. ODsay 30콜/일 잔량도 `/api/stats` 의 `odsay.today_calls` 로 본다.
- **초대·OG 카피 1차**: 접점마다 "할 일 하나"만 남기는 방향으로 정리(카톡 메시지 / 초대 배너 / 방 힌트 / 홈 CTA / OG 문구). 방 카드 제목은 인원이 있으면 `N명이 모이는 중` — 사회적 증거가 참여 이유가 되므로. 푸터의 개인 메모(`rep #1 …`)는 데이터 출처 표기로 교체. **완료**.
- 성능/비용: ODsay Blobs 캐시, 가시성 기반 폴링, 후보 top3 제한. 광고 수익 배선은 **인지만, 테스트 기간이라 보류**.

## 8. 다음 할 일 (미착수)

**제품 방향은 `docs/PLAN.md`(기획 2판)에 정리돼 있다. 여기는 실행 목록만.**

- **Phase 1 — 방을 살린다** (프론트만, 배포 1회). 잠정 중간지점(좌표 평균, API 0) + 주변 가게 카드 +
  "지금 N명 기준" 표시 + 복귀 시 변화 요약(localStorage). 입력 동기 문구는 같은 배포에 함께 나가야 의미가 있다.
- **Phase 2 — 결과를 방에 저장** (서버+프론트). 확정 후에도 방이 거짓말하지 않게.
- **Phase 3 — 가게까지 좁히기** (조건부). Phase 1에서 가게 카드 반응이 있을 때만.
- 시딩: 오픈채팅/소모임/문토 등 커뮤니티 시딩용 카피(콘텐츠 마케팅은 선호 안 함 → 인프로덕트 초대 루프 우선).

### 보류·기각된 것 (되풀이 방지)

- **번화가 점수(지하철 승하차)** — 검증 완료, 지표는 성립했으나 보류. 근거와 실측값은 `docs/PLAN.md` 참고.
- **가중치(70:30)** — 수요 근거가 2인 데이트 앱(더치) 리뷰라 여러 명이 각자 넣는 우리 방과 맞지 않는다.
- **출발 시각 입력** — ODsay `searchPubTransPathT` 에 시간 파라미터가 없어 결과가 안 바뀐다. 가짜 입력이 된다.
- **앱 전환 / 웹 푸시 / 카카오 자동 발송** — 전부 막히거나 해자를 해친다. 근거는 `docs/PLAN.md` 알림 항목.

## 8-1. 배포 크레딧 (2026-09-09 실측)

Netlify 가 새 배포를 안 올려서 처음엔 빌드 실패로 오해했는데, 원인은 **크레딧 소진**이었다. 대시보드 실측:

```
Production deploys   300 credits   ← 20 deploys   (배포 1회 = 15크레딧)
Web requests           0.2 credits   (757 requests)
Compute                0.1 credits
Bandwidth             <1 credit
────────────────────────────────────
Total                300.3 / 300      (Free plan, 청구주기 9/6~10/5)
```

- **비용의 99.9%가 배포다.** 앱 트래픽은 사실상 공짜(0.3크레딧). 5초 폴링이 비싸다는 건 오판이었다 — 지금 규모에선 비용 문제가 아니다(다만 확장 시 손볼 여지는 있음).
- **Free plan 실효 상한 = 월 20회 프로덕션 배포.** 커밋마다 push 하면 하루에 소진된다. 2026-09-09 하루에만 12회 배포로 180크레딧을 썼다.
- 소진되면 **프로덕션 배포만 정지**되고 배포된 사이트는 계속 살아 있다. 남은 30크레딧은 사이트 유지용(operational)이라 배포에 못 쓴다.
- **Deploy preview 는 계속 가능** — 플랜에 "Unlimited deploy previews" 포함. PR 을 열면 미리보기 배포로 검증할 수 있다.
- 다음 리셋: **2026-10-06**. 그때까지 라이브는 `c29f278` 에 고정.
- 대기 중인 커밋: `07ce510`(퍼널 계측) / `ac2cb0b`(stats 잠금) / `7d776e7`(공용 모듈 이동). 리셋되면 한 번의 배포로 함께 나간다.
- **진단 팁**: `/api/stats` 가 `text/html`(Netlify 기본 404)이면 함수 미배포, `text/plain`이면 배포됐고 토큰이 없어 거부된 것.
- 리셋 후 할 일: ① 환경변수 `STATS_TOKEN` 추가 ② `Clear cache and deploy site` ③ `curl "…/api/stats?t=<토큰>&format=text"` ④ `/s?room=` 이 `no-store` 인지 확인.

### 호스팅을 옮길지 (배포 횟수 관점)

| | 배포 제한 | 비고 |
|---|---|---|
| Netlify Free (현재) | **월 20회** | Blobs 내장이 최대 강점 — 방 상태·ODsay 캐시·통계가 외부 서비스 없이 돈다 |
| Cloudflare Pages Free | 월 500 빌드 | KV·D1 1급. 이 프로젝트에 가장 잘 맞는 대안 |
| Vercel Hobby | 일 100 배포 | KV 는 외부 벤더(Upstash 등) 연결 필요 |

옮길 때의 숨은 비용: **ODsay 60일 캐시가 통째로 날아가** 30콜/일 한도를 한동안 더 빨리 쓰게 된다. 기존 방도 전부 깨진다. 그래서 1순위는 이전이 아니라 **push 배칭**이고, 그래도 답답하면 Cloudflare 를 검토한다.

## 9. 개발 워크플로 (중요)
- **이 repo 작업은 Claude Code(claude.ai/code 또는 CLI)에서 repo 바운드로** 한다 → `git commit`/`push` 네이티브로 몇 초.
- **돈이 나가는 건 GitHub 가 아니라 `main` 머지다.** `git commit`/`git push` 는 공짜. `main` 에 올라간 것이 곧 프로덕션 배포 1회 = **15크레딧**이고, Free plan 월 300크레딧이므로 **월 20회가 상한**이다(§8-1 실측).
- **작업은 브랜치에서, push 는 마음껏.** 브랜치 push 는 배포를 만들지 않는다. `main` 머지는 "이제 배포한다"는 뜻이므로 의미 있는 묶음 단위로만 한다.
- **검증 3단계** (배포를 아끼려고 아래로 갈수록 아껴 쓴다):
  1. `npm test` — 로컬. 순수 로직(봇 UA 판별, KST 일자, `/s` OG 카드 렌더·payload 검증)은 여기서 다 잡힌다.
  2. **GitHub Actions** (`.github/workflows/ci.yml`) — push·PR 마다 문법 검사 + 테스트. 공개 저장소라 무료.
  3. **PR Deploy preview** — 플랜에 "Unlimited deploy previews" 포함이라 프로덕션 크레딧을 안 쓴다. 카카오 SDK·Blobs 처럼 실제 환경이 필요한 것만 여기서 본다.
- 테스트는 `test/*.test.mjs`, 러너는 Node 내장(`node --test`, 의존성 없음). **Node 24 에서는 `node --test test/` 가 디렉터리를 모듈로 해석해 실패하므로 인자 없이 자동 탐색을 쓴다.**
- 바닐라 JS 유지(불필요한 프레임워크 도입 금지). ODsay 쿼터 절약 로직(캐시·top3) 건드리지 말 것.
- 참고: Cowork 세션에서는 이 git 루프가 막혀 있어(세션이 컴퓨터 바운드, git 기능 off) 브라우저 우회를 해야 했음 — 그래서 Claude Code로 이관.

## 10. 파일 트리
```
meet-middle/
├─ .github/workflows/ci.yml   # 문법 검사 + 테스트 (공개 저장소라 무료)
├─ test/                      # node --test 용. 배포 없이 검증하는 안전망
│  ├─ stats.test.mjs          #   봇 UA 판별(카톡 인앱=사람) · KST 일자 경계
│  └─ share.test.mjs          #   /s OG 카드 · payload 주입 방어 · 구버전 링크 호환
├─ index.html
├─ app.js
├─ og.png              # 공유 카드 썸네일 1200×630 (docs/og-source.html 에서 구움)
├─ styles.css
├─ config.js            # KAKAO_JS_KEY (public, 도메인 잠금)
├─ netlify.toml
├─ package.json         # @netlify/blobs, type: module
├─ netlify/
│  └─ functions/
│     ├─ _shared/stats.mjs # 퍼널 카운터(공용) — 봇 판별 + KST 일자 키
│                          #   (함수 디렉터리 안의 _ 폴더라 엔드포인트로 잡히지 않음)
│     ├─ room.mjs          # /api/room
│     ├─ participant.mjs   # /api/participant
│     ├─ fairness.mjs      # /api/fairness (ODsay + Blobs 캐시 + minimax)
│     ├─ share.mjs         # /s (OG 카드)
│     └─ stats.mjs         # /api/stats (퍼널 조회)
└─ docs/
   ├─ HANDOFF.md        # 이 문서
   ├─ PLAN.md           # 제품 기획 2판 (살아있는 방)
   ├─ competitors.md    # 경쟁사 스캔
   ├─ og-source.html    # og.png 원본 (헤드리스 크롬으로 스크린샷)
```
