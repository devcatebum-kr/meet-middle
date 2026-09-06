import { getStore } from "@netlify/blobs";

const store = () => getStore("rooms");
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

function newPid(n = 8) {
  const c = "abcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < n; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}

export default async (req) => {
  const s = store();
  const body = await req.json().catch(() => ({}));
  const { roomId } = body;
  if (!roomId) return json({ error: "missing roomId" }, 400);

  const meta = await s.get(`${roomId}:meta`, { type: "json" });
  if (!meta) return json({ error: "room not found" }, 404);

  // 참가자 추가/수정 (participantId를 주면 자기 항목을 갱신)
  if (req.method === "POST") {
    if (body.lat == null || body.lng == null)
      return json({ error: "missing location" }, 400);
    const id = body.participantId || newPid();
    const p = {
      id,
      name: (body.name || "").slice(0, 20),
      label: (body.label || "").slice(0, 60),
      lat: +body.lat,
      lng: +body.lng,
      addedAt: Date.now(),
    };
    await s.setJSON(`${roomId}:p:${id}`, p);
    return json({ ok: true, participant: p });
  }

  // 참가자 삭제
  if (req.method === "DELETE") {
    const id = body.participantId;
    if (!id) return json({ error: "missing participantId" }, 400);
    await s.delete(`${roomId}:p:${id}`);
    return json({ ok: true });
  }

  return json({ error: "method not allowed" }, 405);
};

export const config = { path: "/api/participant" };
