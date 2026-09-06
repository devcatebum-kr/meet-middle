import { getStore } from "@netlify/blobs";

const store = () => getStore("rooms");
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

// 헷갈리기 쉬운 글자(0,1,l,o) 제외한 짧은 방 코드
function newId(n = 6) {
  const c = "abcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < n; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}

export default async (req) => {
  const s = store();

  // 방 생성
  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const roomId = newId();
    await s.setJSON(`${roomId}:meta`, {
      createdAt: Date.now(),
      title: (body.title || "").slice(0, 40),
    });
    return json({ roomId });
  }

  // 방 조회 (참가자 목록 포함)
  if (req.method === "GET") {
    const url = new URL(req.url);
    const roomId = url.searchParams.get("id");
    if (!roomId) return json({ error: "missing id" }, 400);

    const meta = await s.get(`${roomId}:meta`, { type: "json" });
    if (!meta) return json({ error: "not found" }, 404);

    const { blobs } = await s.list({ prefix: `${roomId}:p:` });
    const participants = [];
    for (const b of blobs) {
      const p = await s.get(b.key, { type: "json" });
      if (p) participants.push(p);
    }
    participants.sort((a, b) => a.addedAt - b.addedAt);

    return json({
      roomId,
      createdAt: meta.createdAt,
      title: meta.title || "",
      participants,
    });
  }

  return json({ error: "method not allowed" }, 405);
};

export const config = { path: "/api/room" };
