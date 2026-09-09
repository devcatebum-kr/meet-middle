import { getStore } from "@netlify/blobs";

// 퍼널 카운터. 새 함수 호출을 만들지 않으려고, 이미 돌고 있는 핸들러 안에서
// 하루치 블롭 하나를 읽고-더하고-쓴다. 통계는 절대 본 요청을 실패시키지 않는다.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 하루 경계는 한국 시간 기준 (ODsay 일일 쿼터도 사실상 이 기준으로 본다)
export const kstDay = (t = Date.now()) => new Date(t + KST_OFFSET_MS).toISOString().slice(0, 10);

// 링크 미리보기 봇. 사람 조회수에 섞이면 퍼널이 의미를 잃는다.
// 봇 히트 자체도 신호다 — 카톡이 카드를 만들었다는 건 초대가 실제로 전송됐다는 뜻.
//
// 주의: 카톡 인앱 브라우저(사람)의 UA 에도 "KAKAOTALK" 이 들어간다. 우리 링크는
// 대부분 카톡 안에서 열리므로, 그냥 kakaotalk 을 매칭하면 진짜 사용자가 전부
// 봇으로 잡혀 퍼널이 0이 된다. 스크래퍼는 "kakaotalk-scrap" 으로만 구분한다.
// 같은 이유로 naver/daum/line 같은 인앱 브라우저 토큰도 넣지 않는다.
const BOT_UA =
  /kakaotalk-scrap|facebookexternalhit|slackbot|twitterbot|discordbot|telegrambot|line-poker|googlebot|bingbot|applebot|yeti\/|daumoa|embedly|linkpreview|bot[\/ ]|crawler|spider|scrap/i;
export const isBot = (ua) => BOT_UA.test(String(ua || ""));

const TIMEOUT_MS = 1200;

async function write(counts) {
  const s = getStore("stats");
  const key = kstDay();
  const add = (base) => {
    const n = { ...(base || {}) };
    for (const [k, v] of Object.entries(counts)) n[k] = (n[k] || 0) + v;
    return n;
  };

  // 조건부 쓰기(etag)를 쓸 수 있으면 동시 증가에서도 카운트가 유실되지 않는다.
  if (typeof s.getWithMetadata === "function") {
    for (let i = 0; i < 3; i++) {
      let got;
      try {
        got = await s.getWithMetadata(key, { type: "json" });
      } catch (_) {
        return; // 읽기 실패 → 아무것도 쓰지 않는다. 덮어썼다간 그날 누적치가 날아간다.
      }
      try {
        const res = await s.setJSON(key, add(got && got.data), got?.etag ? { onlyIfMatch: got.etag } : { onlyIfNew: true });
        if (!res || res.modified !== false) return; // 성공
        // modified === false → 그 사이 다른 요청이 썼다. 다시 읽고 재시도.
      } catch (_) {
        break; // 조건부 쓰기 미지원 → 아래 단순 경로로
      }
    }
  }

  // 폴백: 읽고 더해서 쓴다. 동시 요청이 겹치면 일부 유실될 수 있다(이 트래픽 규모에선 감수).
  let cur;
  try {
    cur = await s.get(key, { type: "json" });
  } catch (_) {
    return;
  }
  await s.setJSON(key, add(cur));
}

/**
 * 카운터 여러 개를 한 번의 읽기-쓰기로 올린다. 예: track({ fairness_run: 1, odsay_call: 4 })
 * 실패하거나 느리면 조용히 포기한다 — 사용자 요청을 붙잡지 않는다.
 */
export async function track(counts) {
  if (!counts || !Object.keys(counts).length) return;
  try {
    await Promise.race([
      write(counts),
      new Promise((r) => setTimeout(r, TIMEOUT_MS)),
    ]);
  } catch (_) {
    /* 통계는 실패해도 무시 */
  }
}
