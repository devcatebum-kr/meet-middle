import { getStore } from "@netlify/blobs";
import { kstDay } from "./_shared/stats.mjs";

// 퍼널 조회. 사람이 볼 때만 호출되므로 사용자 트래픽에는 영향이 없다.
//
// 운영자 전용이다. STATS_TOKEN 환경변수(Netlify 대시보드)를 설정하고
// /api/stats?t=<토큰> 으로만 본다. 토큰이 없으면 아예 열리지 않는다(fail-closed) —
// 저장소가 public 이라 이 엔드포인트 주소는 이미 공개돼 있기 때문.

const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const ODSAY_DAILY_CAP = 30;

const ratio = (a, b) => (b > 0 ? Math.round((a / b) * 100) / 100 : null);

function textTable(rows, keys) {
  const head = ["date", ...keys];
  const widths = head.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => String(i === 0 ? r.date : r[keys[i - 1]] ?? 0).length))
  );
  const line = (cells) => cells.map((c, i) => String(c).padStart(widths[i])).join("  ");
  return [line(head), line(widths.map((w) => "-".repeat(w))), ...rows.map((r) => line([r.date, ...keys.map((k) => r[k] ?? 0)]))].join("\n");
}

export default async (req) => {
  if (req.method !== "GET") return json({ error: "method not allowed" }, 405);

  const need = process.env.STATS_TOKEN;
  const url = new URL(req.url);
  // 토큰 미설정 = 잠김. 401 대신 404 로 존재 자체를 알리지 않는다.
  if (!need || url.searchParams.get("t") !== need) {
    return new Response("Not Found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }

  const days = Math.min(Math.max(parseInt(url.searchParams.get("days") || "14", 10) || 14, 1), 90);

  let rows = [];
  try {
    const s = getStore("stats");
    const { blobs } = await s.list();
    const dates = blobs
      .map((b) => b.key)
      .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
      .sort()
      .reverse()
      .slice(0, days);
    rows = await Promise.all(
      dates.map(async (d) => ({ date: d, ...((await s.get(d, { type: "json" })) || {}) }))
    );
  } catch (_) {
    return json({ error: "stats unavailable" }, 500);
  }

  const total = {};
  for (const r of rows) {
    for (const [k, v] of Object.entries(r)) {
      if (k === "date" || typeof v !== "number") continue;
      total[k] = (total[k] || 0) + v;
    }
  }

  const t = (k) => total[k] || 0;
  const today = rows.find((r) => r.date === kstDay()) || {};

  const body = {
    range: { days, from: rows.length ? rows[rows.length - 1].date : null, to: rows.length ? rows[0].date : null },

    // 방 만들기 → 카톡에 카드가 붙음 → 사람이 열람 → 출발지 추가 → 계산 실행
    funnel: {
      room_created: t("room_created"),
      invite_scraped: t("invite_scraped"),
      invite_viewed: t("invite_viewed"),
      participant_joined: t("participant_joined"),
      fairness_run: t("fairness_run"),
    },
    rates: {
      "초대 전송률 (카드 생성/방)": ratio(t("invite_scraped"), t("room_created")),
      "열람당 참여 (참여/열람)": ratio(t("participant_joined"), t("invite_viewed")),
      "방당 참여자": ratio(t("participant_joined"), t("room_created")),
      "방당 계산 실행": ratio(t("fairness_run"), t("room_created")),
    },

    odsay: {
      today_calls: today.odsay_call || 0,
      daily_cap: ODSAY_DAILY_CAP,
      today_cache_hits: today.odsay_cache_hit || 0,
      cache_hit_rate: ratio(t("odsay_cache_hit"), t("odsay_cache_hit") + t("odsay_call")),
    },

    total,
    days: rows,
  };

  if (url.searchParams.get("format") === "text") {
    const keys = ["room_created", "invite_scraped", "invite_viewed", "participant_joined", "fairness_run", "odsay_call"];
    const txt =
      textTable(rows, keys) +
      `\n\n오늘 ODsay ${body.odsay.today_calls}/${ODSAY_DAILY_CAP}콜 · 캐시 적중 ${body.odsay.cache_hit_rate ?? "-"}\n` +
      Object.entries(body.rates).map(([k, v]) => `${k}: ${v ?? "-"}`).join("\n") + "\n";
    return new Response(txt, {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }

  return json(body);
};

export const config = { path: "/api/stats" };
