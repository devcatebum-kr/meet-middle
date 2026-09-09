import { test } from "node:test";
import assert from "node:assert/strict";
import { isBot, kstDay } from "../netlify/functions/_shared/stats.mjs";

// 카톡 인앱 브라우저(사람)의 UA 에도 "KAKAOTALK" 이 들어간다. 우리 링크는 대부분
// 카톡 안에서 열리므로, 여기서 사람을 봇으로 잡으면 초대 퍼널이 통째로 0이 된다.
// 이 테스트가 그 회귀를 막는다.
test("isBot: 링크 미리보기 봇만 걸러낸다", () => {
  const bots = [
    ["카톡 스크래퍼", "facebookexternalhit/1.1;kakaotalk-scrap/1.0;"],
    ["Slack", "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)"],
    ["Google", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"],
    ["Naver Yeti", "Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd)"],
  ];
  for (const [label, ua] of bots) assert.equal(isBot(ua), true, `${label} 은 봇이어야 한다`);

  const humans = [
    ["카톡 인앱", "Mozilla/5.0 (Linux; Android 13; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36 KAKAOTALK 10.4.5"],
    ["네이버 인앱", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) NAVER(inapp; search; 2000; 12.4.4)"],
    ["라인 인앱", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Line/14.1.0"],
    ["iOS Safari", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"],
    ["Android Chrome", "Mozilla/5.0 (Linux; Android 14; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36"],
  ];
  for (const [label, ua] of humans) assert.equal(isBot(ua), false, `${label} 은 사람이어야 한다`);

  assert.equal(isBot(""), false);
  assert.equal(isBot(null), false);
});

test("kstDay: 하루 경계가 한국 시간 기준", () => {
  assert.equal(kstDay(Date.parse("2026-09-09T15:30:00Z")), "2026-09-10"); // KST 00:30
  assert.equal(kstDay(Date.parse("2026-09-09T14:30:00Z")), "2026-09-09"); // KST 23:30
  assert.match(kstDay(), /^\d{4}-\d{2}-\d{2}$/);
});
