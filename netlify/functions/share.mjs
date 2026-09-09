import { getStore } from "@netlify/blobs";
import { track, isBot } from "./_shared/stats.mjs";

const esc = (s) =>
  String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// 결과 payload(base64url)는 앱이 만든 형태만 통과시킨다 — HTML/JS로 새어나갈 문자를 원천 차단.
const B64 = /^[A-Za-z0-9+/=_-]{4,4000}$/;

// app.js 의 b64e 역연산. 실패하면 null (조작된 링크는 기본 카드로).
function decodeResult(raw) {
  if (!raw || !B64.test(raw)) return null;
  try {
    const b = raw.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b + "=".repeat((4 - (b.length % 4)) % 4);
    const arr = JSON.parse(Buffer.from(pad, "base64").toString("utf8"));
    return Array.isArray(arr) && arr.length >= 2 ? arr : null;
  } catch (_) {
    return null;
  }
}

function namesLine(arr) {
  const names = arr.map((x) => String((x && x.n) || "").trim()).filter(Boolean);
  if (!names.length) return "";
  return names.length <= 3
    ? names.join("·")
    : names.slice(0, 3).join("·") + ` 외 ${names.length - 3}명`;
}

// 공유 링크(카톡 등)에서 OG 미리보기 카드를 띄우기 위한 서버 렌더 페이지.
// 스크래퍼는 OG 태그를 읽고, 사람은 실제 앱으로 즉시 리다이렉트된다.
export default async (req) => {
  const url = new URL(req.url);
  const roomId = url.searchParams.get("room");
  const result = url.searchParams.get("r");
  const bot = isBot(req.headers.get("user-agent"));

  let title = "중간에서 보자";
  let desc = "다들 출발지를 넣으면, 가장 공평한 중간 지하철역을 찾아줘요.";
  let dest = "/";

  if (roomId) {
    dest = "/?room=" + encodeURIComponent(roomId);
    let n = 0;
    let exists = false;
    try {
      const s = getStore("rooms");
      const meta = await s.get(`${roomId}:meta`, { type: "json" });
      if (meta) {
        exists = true;
        const { blobs } = await s.list({ prefix: `${roomId}:p:` });
        n = blobs.length;
      }
    } catch (_) {}
    // 카드 제목에 인원수를 넣는다 — 이미 모인 사람이 있다는 게 가장 강한 참여 이유라서.
    title = exists && n > 0 ? `중간에서 보자 — ${n}명이 모이는 중` : "중간에서 보자 — 중간지점 정하기";
    desc =
      exists && n > 0
        ? `열어서 내 출발지만 추가하면 끝 · 다 모이면 대중교통 시간 기준으로 가장 공평한 역을 찾아드려요.`
        : "링크를 열고 내 출발지만 넣으면 끝 — 가장 오래 걸리는 사람 기준으로 공평한 역을 찾아드려요.";
  } else if (result) {
    const arr = decodeResult(result);
    if (arr) {
      // 앱에는 해시(#r=)로 넘긴다 — 출발지 좌표가 앱 요청에는 다시 실리지 않게.
      dest = "/#r=" + result;
      const who = namesLine(arr);
      title = `중간에서 보자 — ${arr.length}명이 만날 중간지점`;
      desc =
        (who ? who + " · " : "") +
        "추천 역과 각자 소요시간이 담겨 있어요. 열어서 확인해보세요.";
    }
  }

  const canonical = url.origin + url.pathname + url.search;
  // 카톡 카드 썸네일. 이미지를 교체하면 ?v= 를 올려야 스크래퍼 캐시가 갱신된다(index.html 과 같이).
  const image = url.origin + "/og.png?v=1";
  const html =
    `<!doctype html><html lang="ko"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>${esc(title)}</title>` +
    `<meta name="description" content="${esc(desc)}">` +
    // 공유 링크에는 참여자 이름·출발지가 담기므로 검색엔진 색인은 막는다(OG 스크래퍼는 그대로 읽음).
    `<meta name="robots" content="noindex,nofollow">` +
    `<meta property="og:type" content="website">` +
    `<meta property="og:title" content="${esc(title)}">` +
    `<meta property="og:description" content="${esc(desc)}">` +
    `<meta property="og:url" content="${esc(canonical)}">` +
    `<meta property="og:image" content="${esc(image)}">` +
    `<meta property="og:image:width" content="1200">` +
    `<meta property="og:image:height" content="630">` +
    `<meta property="og:image:alt" content="중간에서 보자 — 다 같이 공평한 중간 지하철역">` +
    `<meta name="twitter:card" content="summary_large_image">` +
    `<meta name="twitter:image" content="${esc(image)}">` +
    `<meta http-equiv="refresh" content="0;url=${esc(dest)}">` +
    `<script>location.replace(${JSON.stringify(dest)});</script>` +
    `</head><body style="font-family:system-ui;padding:24px">` +
    `이동 중… 자동으로 안 열리면 <a href="${esc(dest)}">여기</a>를 눌러주세요.` +
    `</body></html>`;

  if (roomId) {
    // 봇 히트도 신호다 — 카톡이 카드를 만들었다는 건 초대가 실제로 전송됐다는 뜻.
    await track({ [bot ? "invite_scraped" : "invite_viewed"]: 1 });
  } else if (result) {
    await track({ [bot ? "result_scraped" : "result_viewed"]: 1 });
  }

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      // 방 카드는 참여자 수가 실시간으로 바뀌고 열람도 세야 하므로 캐시하지 않는다.
      // 결과 카드는 payload 로만 결정되는 고정 내용이라 캐시해도 된다.
      "cache-control": roomId ? "no-store" : "public, max-age=300",
    },
  });
};

export const config = { path: "/s" };
