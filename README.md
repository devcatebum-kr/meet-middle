# 중간에서 보자 (meet-middle)

모임 참가자들의 출발지를 모아 **가장 공평한 중간 지하철역**을 찾아주는 도구.
v1.1부터 좌표 평균이 아니라 **대중교통 소요시간**으로 "가장 오래 걸리는 사람을 최소화"하는 지점을 추천한다.

## 기능

- **솔로 모드** — 한 명이 전원 출발지를 넣고 바로 계산
- **협업 방** — 방을 만들어 링크를 공유하면, 친구들이 각자 자기 출발지를 추가 (Netlify Blobs에 저장, 폴링으로 라이브 갱신)
- **시간 공평 추천** — 후보 역들에 대해 각 사람의 대중교통 소요시간(ODsay)을 구해 최대 이동시간이 작은 역을 상위로
- **만날 장소** — 추천 역 근처 카페·맛집 몇 곳 (카카오 로컬)
- **길찾기 딥링크 / 카톡 복사 텍스트 / 결과 공유 링크** — 공유 링크는 `/s`를 거쳐 카톡 미리보기(OG) 카드가 뜬다

## 스택

- 프론트: 바닐라 HTML/JS + 카카오 지도 JS SDK (services) — 빌드 스텝 없음
- 백엔드: Netlify Functions (v2, ESM)
  - `POST/GET /api/room` — 방 생성/조회
  - `POST/DELETE /api/participant` — 참가자 추가/삭제
  - `POST /api/fairness` — ODsay 대중교통 시간 계산 (키는 서버에서만)
  - `GET /s` — 공유 링크용 OG 카드 서버 렌더 (`?room=` 방 초대 / `?r=` 결과) 후 앱으로 리다이렉트
  - `GET /api/stats` — 퍼널 조회 (`?format=text`). 카운터는 위 함수들 안에서 올라가므로 추가 호출이 없다
- 저장: Netlify Blobs (`rooms` 스토어, 참가자별 키로 분리 저장 → 동시 입력 안전)

## 환경 변수 (Netlify site settings)

| 이름 | 설명 |
|---|---|
| `ODSAY_API_KEY` | ODsay 대중교통 길찾기 API 키. 없으면 직선거리 기반 추정치로 자동 폴백. |
| `STATS_TOKEN` | (선택) 설정하면 `/api/stats?t=<토큰>` 으로만 퍼널을 볼 수 있다. 미설정 시 공개. |

## 로컬 개발

```bash
npm install
npx netlify dev
```

## 배포

GitHub에 push → 기존 Netlify 사이트가 자동 빌드·배포.
카카오 JavaScript SDK 도메인에 배포 도메인이 등록돼 있어야 지도가 뜬다.
