import { test } from "node:test";
import assert from "node:assert/strict";
import share from "../netlify/functions/share.mjs";

// app.js 의 b64e 와 같은 인코딩(base64url)
const b64e = (obj) =>
  Buffer.from(JSON.stringify(obj), "utf8").toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const ORIGIN = "https://example.netlify.app";
const card = async (qs) => {
  const html = await (await share(new Request(`${ORIGIN}/s${qs}`))).text();
  const pick = (p) => (html.match(new RegExp(`<meta property="og:${p}" content="([^"]*)"`)) || [, ""])[1];
  return { html, title: pick("title"), desc: pick("description"), image: pick("image") };
};

const PEOPLE = [
  { n: "범주", la: 37.4979, ln: 127.0276, l: "강남역" },
  { n: "수진", la: 37.5572, ln: 126.9245, l: "홍대입구역" },
  { n: "민지", la: 37.4766, ln: 126.9816, l: "사당역" },
];

test("결과 링크: 인원수와 이름이 카드에 들어간다", async () => {
  const c = await card("?r=" + b64e(PEOPLE));
  assert.match(c.title, /3명이 만날 중간지점/);
  assert.match(c.desc, /범주·수진·민지/);
  assert.match(c.image, /\/og\.png/);
  // 해시로 되돌려 좌표가 앱 요청에 다시 실리지 않게 한다
  assert.match(c.html, /location\.replace\("\/#r=/);
});

test("결과 링크: 이름이 없으면 인원수만", async () => {
  const c = await card("?r=" + b64e([{ n: "", la: 37.5, ln: 127, l: "A" }, { n: "", la: 37.6, ln: 127.1, l: "B" }]));
  assert.match(c.title, /2명이 만날 중간지점/);
  assert.doesNotMatch(c.desc, /·\s·/);
});

test("조작된 payload 는 기본 카드로 폴백하고 주입되지 않는다", async () => {
  for (const bad of [
    "?r=" + encodeURIComponent("<script>alert(1)</script>"),
    "?r=" + b64e({ notAnArray: true }),
    "?r=" + b64e(["한 명뿐"]),
    "?r=!!!!",
    "?r=",
  ]) {
    const c = await card(bad);
    assert.equal(c.title, "중간에서 보자", `기본 카드여야 한다: ${bad}`);
    assert.doesNotMatch(c.html, /<script>alert/);
    assert.match(c.html, /location\.replace\("\/"\)/);
  }
});

test("구버전 표준 base64(#r=) 링크도 계속 읽힌다", async () => {
  const legacy = Buffer.from(JSON.stringify(PEOPLE), "utf8").toString("base64");
  const c = await card("?r=" + legacy);
  assert.match(c.title, /3명이 만날 중간지점/);
});

test("공유 페이지는 검색엔진 색인에서 빠진다", async () => {
  const c = await card("?r=" + b64e(PEOPLE));
  assert.match(c.html, /<meta name="robots" content="noindex,nofollow">/);
});
