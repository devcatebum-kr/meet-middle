import { getStore } from "@netlify/blobs";

const esc = (s) =>
  String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// 공유 링크(카톡 등)에서 OG 미리보기 카드를 띄우기 위한 서버 렌더 페이지.
// 스크래퍼는 OG 태그를 읽고, 사람은 실제 앱으로 즉시 리다이렉트된다.
export default async (req) => {
  const url = new URL(req.url);
  const roomId = url.searchParams.get("room");

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
    title = "중간에서 보자 — 모임 중간지점";
    desc = !exists
      ? "링크를 열고 각자 출발지를 넣으면 공평한 중간 지하철역을 찾아줘요."
      : n > 0
      ? `${n}명이 모이는 중 · 링크 열고 내 출발지를 추가해요.`
      : "링크를 열고 각자 출발지를 넣으면 공평한 중간 지하철역을 찾아줘요.";
  }

  const canonical = url.origin + url.pathname + url.search;
  const html =
    `<!doctype html><html lang="ko"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>${esc(title)}</title>` +
    `<meta name="description" content="${esc(desc)}">` +
    `<meta property="og:type" content="website">` +
    `<meta property="og:title" content="${esc(title)}">` +
    `<meta property="og:description" content="${esc(desc)}">` +
    `<meta property="og:url" content="${esc(canonical)}">` +
    `<meta name="twitter:card" content="summary">` +
    `<meta http-equiv="refresh" content="0;url=${esc(dest)}">` +
    `<script>location.replace(${JSON.stringify(dest)});</script>` +
    `</head><body style="font-family:system-ui;padding:24px">` +
    `이동 중… 자동으로 안 열리면 <a href="${esc(dest)}">여기</a>를 눌러주세요.` +
    `</body></html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
};

export const config = { path: "/s" };
