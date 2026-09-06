(() => {
  const $ = (id) => document.getElementById(id);
  const cfg = window.APP_CONFIG || {};
  const S = { ps: null, ready: false, people: [], room: null, myPid: null, myPick: null, poll: null, map: null };

  /* ---------- Kakao SDK ---------- */
  function boot() {
    const key = cfg.KAKAO_JS_KEY;
    if (!key || key === "YOUR_KAKAO_JS_KEY") $("keyWarn").hidden = false;
    const s = document.createElement("script");
    s.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&libraries=services&autoload=false`;
    s.onload = () => kakao.maps.load(() => { S.ps = new kakao.maps.services.Places(); S.ready = true; });
    document.head.appendChild(s);
    route();
  }

  function route() {
    const params = new URLSearchParams(location.search);
    if (params.get("room")) return enterRoom(params.get("room"));
    const m = location.hash.match(/[#&]r=([^&]+)/);
    if (m) return renderShared(m[1]);
    showHome();
  }

  /* ---------- helpers ---------- */
  function show(view) {
    ["homeView", "roomView", "resultsView"].forEach((v) => ($(v).hidden = v !== view));
  }
  function toast(msg) {
    let t = $("toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("on");
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("on"), 2200);
  }
  const esc = (s) => (s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const b64e = (obj) => btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
  const b64d = (str) => JSON.parse(decodeURIComponent(escape(atob(str))));

  function categoryP(code, opts) {
    return new Promise((res) => { if (!S.ps) return res([]); S.ps.categorySearch(code, (d, st) => res(st === kakao.maps.services.Status.OK ? d : []), opts); });
  }
  function haversineKm(a, b) {
    const R = 6371, toR = (x) => (x * Math.PI) / 180;
    const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  /* ---------- place search widget ---------- */
  function makeSearcher(queryInput, resultsUl, onPick) {
    return () => {
      const q = queryInput.value.trim();
      if (!q) return;
      if (!S.ready) { toast("지도를 불러오는 중이에요. 잠시 후 다시."); return; }
      S.ps.keywordSearch(q, (data, status) => {
        resultsUl.innerHTML = "";
        if (status !== kakao.maps.services.Status.OK || !data.length) {
          resultsUl.innerHTML = '<li class="empty">결과가 없어요. 다르게 검색해보세요.</li>';
          return;
        }
        data.slice(0, 5).forEach((p) => {
          const li = document.createElement("li");
          const addr = p.road_address_name || p.address_name || "";
          li.textContent = p.place_name + (addr ? "  ·  " + addr : "");
          li.onclick = () => { onPick({ lat: +p.y, lng: +p.x, label: p.place_name }); resultsUl.innerHTML = ""; };
          resultsUl.appendChild(li);
        });
      });
    };
  }

  /* ---------- HOME (solo) ---------- */
  function showHome() {
    show("homeView");
    S.people = [];
    $("soloPeople").innerHTML = "";
    addSolo();
    addSolo();
  }
  function addSolo() {
    const person = { name: "", lat: null, lng: null, label: "" };
    S.people.push(person);
    const row = document.createElement("div");
    row.className = "prow";
    row.innerHTML = `
      <div class="person">
        <input class="name" type="text" placeholder="이름">
        <input type="text" placeholder="출발지 (주소·역·건물명)">
        <button class="ghost sm act">검색</button>
      </div>
      <ul class="results"></ul>
      <div class="picked"></div>`;
    const inputs = row.querySelectorAll("input");
    const nameI = inputs[0], qI = inputs[1];
    const ul = row.querySelector(".results");
    const picked = row.querySelector(".picked");
    nameI.addEventListener("input", () => (person.name = nameI.value));
    const run = makeSearcher(qI, ul, ({ lat, lng, label }) => {
      person.lat = lat; person.lng = lng; person.label = label;
      picked.textContent = "✓ " + label;
    });
    row.querySelector(".act").onclick = run;
    qI.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); run(); } });
    $("soloPeople").appendChild(row);
  }

  /* ---------- ROOM ---------- */
  async function makeRoom() {
    try {
      const r = await fetch("/api/room", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const d = await r.json();
      if (!d.roomId) throw new Error("no id");
      history.replaceState(null, "", "?room=" + d.roomId);
      enterRoom(d.roomId);
    } catch (e) {
      toast("방 생성에 실패했어요. 잠시 후 다시 시도해주세요.");
    }
  }

  function enterRoom(roomId) {
    show("roomView");
    S.room = { roomId, participants: [] };
    S.myPid = localStorage.getItem("pid:" + roomId) || null;

    const link = location.origin + "/?room=" + roomId;
    $("shareLink").value = link;
    $("copyLink").onclick = () =>
      navigator.clipboard.writeText(link).then(() => toast("링크를 복사했어요!"), () => toast(link));

    S.myPick = null;
    $("myAdd").disabled = true;
    $("myPicked").textContent = "";
    const run = makeSearcher($("myQ"), $("myResults"), (pick) => {
      S.myPick = pick; $("myPicked").textContent = "✓ " + pick.label; $("myAdd").disabled = false;
    });
    $("myoSearch").onclick = run;
    $("myQ").onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); run(); } };
    $("myAdd").onclick = addMe;
    $("roomFind").onclick = () => {
      const ppl = (S.room.participants || []).filter((p) => p.lat != null);
      if (ppl.length < 2) return toast("2명 이상 출발지를 넣어야 해요.");
      compute(ppl);
    };

    refreshRoom();
    clearInterval(S.poll);
    S.poll = setInterval(refreshRoom, 4000);
  }

  async function addMe() {
    if (!S.myPick) return;
    const body = { roomId: S.room.roomId, name: $("myName").value.trim(), lat: S.myPick.lat, lng: S.myPick.lng, label: S.myPick.label };
    if (S.myPid) body.participantId = S.myPid;
    try {
      const r = await fetch("/api/participant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (d.participant) { S.myPid = d.participant.id; localStorage.setItem("pid:" + S.room.roomId, S.myPid); }
      $("myPicked").textContent = ""; $("myQ").value = ""; $("myAdd").disabled = true; S.myPick = null;
      toast("추가됐어요!");
      refreshRoom();
    } catch (e) {
      toast("추가에 실패했어요.");
    }
  }

  async function removeMe(pid) {
    try {
      await fetch("/api/participant", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ roomId: S.room.roomId, participantId: pid }) });
      if (pid === S.myPid) { localStorage.removeItem("pid:" + S.room.roomId); S.myPid = null; }
      refreshRoom();
    } catch (e) {
      toast("삭제에 실패했어요.");
    }
  }

  async function refreshRoom() {
    if (!S.room) return;
    try {
      const r = await fetch("/api/room?id=" + encodeURIComponent(S.room.roomId));
      if (!r.ok) { if (r.status === 404) toast("방을 찾을 수 없어요."); return; }
      const d = await r.json();
      S.room.participants = d.participants || [];
      renderParts();
    } catch (e) {
      /* 일시적 네트워크 문제 — 다음 폴링에서 재시도 */
    }
  }

  function renderParts() {
    const list = $("partList"); list.innerHTML = "";
    const ppl = S.room.participants || [];
    $("pCount").textContent = ppl.length;
    ppl.forEach((p) => {
      const li = document.createElement("li");
      const mine = p.id === S.myPid;
      li.innerHTML = `<span class="pname">${esc(p.name || "익명")}</span><span class="pplace">${esc(p.label || "")}</span>`;
      if (mine) {
        li.classList.add("mine");
        const x = document.createElement("button");
        x.className = "x"; x.textContent = "✕"; x.title = "내 항목 삭제";
        x.onclick = () => removeMe(p.id);
        li.appendChild(x);
      }
      list.appendChild(li);
    });
    $("roomFind").disabled = ppl.filter((p) => p.lat != null).length < 2;
  }

  /* ---------- COMPUTE + RESULTS ---------- */
  async function compute(people) {
    clearInterval(S.poll);
    show("resultsView");
    $("stationList").innerHTML = '<li class="loading">중간지점 계산 중…</li>';
    $("fairBadge").hidden = true;
    $("copyHint").textContent = "";

    const cLat = people.reduce((s, p) => s + p.lat, 0) / people.length;
    const cLng = people.reduce((s, p) => s + p.lng, 0) / people.length;
    const center = new kakao.maps.LatLng(cLat, cLng);

    S.map = new kakao.maps.Map($("map"), { center, level: 7 });
    const bounds = new kakao.maps.LatLngBounds();
    people.forEach((p) => {
      const pos = new kakao.maps.LatLng(p.lat, p.lng);
      new kakao.maps.Marker({ position: pos, map: S.map });
      bounds.extend(pos);
    });

    // 후보 지하철역 (centroid 근처, 반경 확장)
    let stations = [];
    for (let radius = 1500; radius <= 6000 && stations.length < 5; radius += 1500) {
      const data = await categoryP("SW8", { location: center, radius, sort: kakao.maps.services.SortBy.DISTANCE });
      stations = dedupeStations(data);
    }
    if (!stations.length) {
      $("stationList").innerHTML = '<li class="empty">근처에서 지하철역을 못 찾았어요.</li>';
      S.map.setBounds(bounds);
      return;
    }
    const candidates = stations.slice(0, 5).map((s) => ({
      name: s.place_name, lat: +s.y, lng: +s.x, address: s.road_address_name || s.address_name || "",
    }));

    // 시간 공평 (ODsay via function; 실패 시 거리 기반 폴백)
    let ranked = null, usedTransit = false;
    try {
      const r = await fetch("/api/fairness", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ people: people.map((p) => ({ lat: p.lat, lng: p.lng })), candidates }),
      });
      if (r.ok) { const d = await r.json(); if (d.candidates) { ranked = d.candidates; usedTransit = !!d.usedTransit; } }
    } catch (e) { /* fallback */ }
    if (!ranked) ranked = rankByDistance(people, candidates);

    const top = ranked.slice(0, 3);

    // 각 역 근처 만날 장소 (병렬)
    await Promise.all(top.map(async (st) => {
      const loc = new kakao.maps.LatLng(st.lat, st.lng);
      const [cafes, foods] = await Promise.all([
        categoryP("CE7", { location: loc, radius: 400, sort: kakao.maps.services.SortBy.DISTANCE }),
        categoryP("FD6", { location: loc, radius: 400, sort: kakao.maps.services.SortBy.DISTANCE }),
      ]);
      st.spots = [...cafes.slice(0, 2), ...foods.slice(0, 2)].map((s) => s.place_name);
    }));

    renderStations(top, people, usedTransit, bounds);
    buildCopy(top, people);
  }

  function dedupeStations(data) {
    const seen = new Set(); const out = [];
    for (const s of data) {
      const base = s.place_name.replace(/\s*\d?호선.*$/, "").replace(/역$/, "").trim();
      if (seen.has(base)) continue;
      seen.add(base); out.push(s);
    }
    return out;
  }

  function rankByDistance(people, candidates) {
    return candidates.map((c) => {
      const times = people.map((p) => ({ min: Math.round((haversineKm(p, c) / 25) * 60 + 6), source: "estimate" }));
      const mins = times.map((t) => t.min);
      return { ...c, times, maxMin: Math.max(...mins), sumMin: mins.reduce((a, b) => a + b, 0) };
    }).sort((a, b) => a.maxMin - b.maxMin || a.sumMin - b.sumMin);
  }

  function renderStations(top, people, usedTransit, bounds) {
    $("fairBadge").hidden = false;
    $("fairBadge").textContent = usedTransit ? "대중교통 시간 기준" : "직선거리 추정";
    const ul = $("stationList"); ul.innerHTML = "";
    top.forEach((st, n) => {
      const pos = new kakao.maps.LatLng(st.lat, st.lng);
      new kakao.maps.Marker({ position: pos, map: S.map, image: starMarker() });
      bounds.extend(pos);
      const times = (st.times || []).map((t, i) => `${esc(people[i].name || "P" + (i + 1))} ${t.min}분`).join(" · ");
      const spots = (st.spots || []).filter(Boolean);
      const nav = `https://map.kakao.com/link/to/${encodeURIComponent(st.name)},${st.lat},${st.lng}`;
      const li = document.createElement("li");
      li.innerHTML =
        `<div class="st-head"><span class="rank">${n + 1}</span> <span class="nm">${esc(st.name)}</span>` +
        `<span class="mx">최대 ${st.maxMin}분</span></div>` +
        `<div class="meta">${esc(st.address || "")}</div>` +
        (times ? `<div class="times">${times}</div>` : "") +
        (spots.length ? `<div class="spots">${spots.map((s) => `<span>${esc(s)}</span>`).join("")}</div>` : "") +
        `<a class="nav" href="${nav}" target="_blank" rel="noopener">길찾기 ↗</a>`;
      ul.appendChild(li);
    });
    S.map.setBounds(bounds);
  }

  function starMarker() {
    const svg = encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34"><circle cx="17" cy="17" r="11" fill="#0F7A6B" stroke="#fff" stroke-width="3"/></svg>'
    );
    return new kakao.maps.MarkerImage("data:image/svg+xml," + svg, new kakao.maps.Size(34, 34));
  }

  function buildCopy(top, people) {
    let t = "📍 중간지점 추천\n";
    top.forEach((st, n) => {
      const times = (st.times || []).map((x, i) => `${people[i].name || "P" + (i + 1)} ${x.min}분`).join(", ");
      t += `${n + 1}. ${st.name}${times ? ` (${times})` : ""}\n`;
    });
    t += "\n(출발지: " + people.map((p) => (p.name ? p.name + " " : "") + p.label).join(", ") + ")";
    const shareUrl =
      location.origin + "/#r=" +
      b64e(people.map((p) => ({ n: p.name || "", la: +(+p.lat).toFixed(6), ln: +(+p.lng).toFixed(6), l: p.label || "" })));
    t += "\n" + shareUrl;

    $("copyText").onclick = () =>
      navigator.clipboard.writeText(t).then(() => toast("카톡용 텍스트를 복사했어요!"), () => ($("copyHint").textContent = t));
    $("copyResult").onclick = () =>
      navigator.clipboard.writeText(shareUrl).then(() => toast("결과 링크를 복사했어요!"), () => ($("copyHint").textContent = shareUrl));
  }

  function renderShared(hash) {
    try {
      const arr = b64d(hash);
      const people = arr.map((x) => ({ name: x.n, lat: x.la, lng: x.ln, label: x.l }));
      if (people.length < 2) throw new Error("too few");
      const start = () => (S.ready ? compute(people) : setTimeout(start, 150));
      start();
    } catch (e) {
      toast("공유 링크를 읽지 못했어요.");
      showHome();
    }
  }

  /* ---------- wire up ---------- */
  document.addEventListener("DOMContentLoaded", () => {
    $("soloAdd").onclick = addSolo;
    $("soloFind").onclick = () => {
      const ppl = S.people.filter((p) => p.lat != null);
      if (ppl.length < 2) return toast("출발지를 2명 이상 선택해주세요 (검색 후 결과 클릭).");
      compute(ppl);
    };
    $("makeRoom").onclick = makeRoom;
    $("backHome").onclick = () => {
      location.hash = "";
      history.replaceState(null, "", location.pathname);
      showHome();
    };
    boot();
  });
})();
