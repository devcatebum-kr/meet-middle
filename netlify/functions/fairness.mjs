const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

// 직선거리(km) — ODsay 실패 시 폴백용
function haversineKm(a, b) {
  const R = 6371;
  const toR = (x) => (x * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat);
  const dLng = toR(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// 직선거리 → 대중교통 소요시간 추정 (평균 25km/h + 환승·도보 6분 오버헤드)
function estimateMin(from, to) {
  const km = haversineKm(from, to);
  return { min: Math.round((km / 25) * 60 + 6), source: "estimate" };
}

// ODsay 대중교통 경로: 좌표는 X=경도(lng), Y=위도(lat)
async function transitMin(key, from, to) {
  const u =
    `https://api.odsay.com/v1/api/searchPubTransPathT` +
    `?SX=${from.lng}&SY=${from.lat}&EX=${to.lng}&EY=${to.lat}` +
    `&apiKey=${encodeURIComponent(key)}`;
  try {
    const r = await fetch(u);
    const d = await r.json();
    const t = d?.result?.path?.[0]?.info?.totalTime;
    if (typeof t === "number" && t > 0) return { min: t, source: "transit" };
  } catch (_) {
    /* fall through */
  }
  return estimateMin(from, to);
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const key = process.env.ODSAY_API_KEY;
  const body = await req.json().catch(() => ({}));
  const people = Array.isArray(body.people) ? body.people : [];
  const candidates = Array.isArray(body.candidates) ? body.candidates : [];

  if (people.length < 2 || candidates.length === 0)
    return json({ error: "need people(>=2) and candidates" }, 400);

  const results = [];
  for (const c of candidates) {
    // 한 후보 역에 대해 사람들 소요시간은 병렬로
    const times = await Promise.all(
      people.map((p) =>
        key ? transitMin(key, p, c) : Promise.resolve(estimateMin(p, c))
      )
    );
    const mins = times.map((t) => t.min);
    results.push({
      name: c.name,
      lat: c.lat,
      lng: c.lng,
      address: c.address || "",
      times, // 사람 순서대로 [{min, source}]
      maxMin: Math.max(...mins),
      sumMin: mins.reduce((a, b) => a + b, 0),
    });
  }

  // 공평 = 가장 오래 걸리는 사람을 최소화(minimax), 동률이면 총합으로
  results.sort((a, b) => a.maxMin - b.maxMin || a.sumMin - b.sumMin);

  return json({ candidates: results, usedTransit: !!key });
};

export const config = { path: "/api/fairness" };
