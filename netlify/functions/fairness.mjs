import { getStore } from "@netlify/blobs";
import { track } from "../lib/stats.mjs";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const ODSAY_REFERER = process.env.ODSAY_REFERER || "https://idyllic-pasca-95ae55.netlify.app";

const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 60; // 60d

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

function estimateMin(from, to) {
  const km = haversineKm(from, to);
  return { min: Math.round((km / 25) * 60 + 6), source: "estimate" };
}

const round3 = (n) => Math.round(n * 1000) / 1000;
const cacheKey = (from, to) =>
  `${round3(from.lat)},${round3(from.lng)}_${round3(to.lat)},${round3(to.lng)}`;

async function transitMin(key, from, to, cache, tally) {
  const ck = cacheKey(from, to);

  if (cache) {
    try {
      const hit = await cache.get(ck, { type: "json" });
      if (hit && typeof hit.min === "number" && Date.now() - hit.ts < CACHE_TTL_MS) {
        tally.cache += 1;
        return { min: hit.min, source: "transit", cached: true };
      }
    } catch (_) {}
  }

  const u =
    `https://api.odsay.com/v1/api/searchPubTransPathT` +
    `?SX=${from.lng}&SY=${from.lat}&EX=${to.lng}&EY=${to.lat}` +
    `&apiKey=${encodeURIComponent(key)}`;
  try {
    tally.call += 1; // 실제로 나간 ODsay 호출 — 무료 30콜/일 대비 사용량을 보려고
    const r = await fetch(u, { headers: { Referer: ODSAY_REFERER } });
    const d = await r.json();
    const t = d?.result?.path?.[0]?.info?.totalTime;
    if (typeof t === "number" && t > 0) {
      tally.ok += 1;
      if (cache) {
        try {
          await cache.setJSON(ck, { min: t, ts: Date.now() });
        } catch (_) {}
      }
      return { min: t, source: "transit" };
    }
  } catch (_) {}
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

  let cache = null;
  try {
    cache = getStore("odsay-cache");
  } catch (_) {}

  const tally = { call: 0, ok: 0, cache: 0 };

  const results = [];
  for (const c of candidates) {
    const times = await Promise.all(
      people.map((p) =>
        key ? transitMin(key, p, c, cache, tally) : Promise.resolve(estimateMin(p, c))
      )
    );
    const mins = times.map((t) => t.min);
    results.push({
      name: c.name,
      lat: c.lat,
      lng: c.lng,
      address: c.address || "",
      times,
      maxMin: Math.max(...mins),
      sumMin: mins.reduce((a, b) => a + b, 0),
    });
  }

  results.sort((a, b) => a.maxMin - b.maxMin || a.sumMin - b.sumMin);

  await track({
    fairness_run: 1,
    odsay_call: tally.call,
    odsay_ok: tally.ok,
    odsay_cache_hit: tally.cache,
  });

  return json({ candidates: results, usedTransit: !!key });
};

export const config = { path: "/api/fairness" };
