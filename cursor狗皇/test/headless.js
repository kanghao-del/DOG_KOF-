/* Headless smoke test: stub DOM/canvas/audio, run the real engine for many
   frames across multiple scenarios, and assert no runtime errors + correct
   round/curse behavior. Run: node test/headless.js  */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const src = fs.readFileSync(path.join(__dirname, "..", "game.js"), "utf8");

// ---- stubs ----
function fakeEl() {
  return {
    classList: { add() {}, remove() {}, contains() { return false; } },
    addEventListener() {},
    style: {},
    textContent: "",
    width: 960, height: 540,
  };
}
const gradient = { addColorStop() {} };
const ctxProxy = new Proxy({}, {
  get(_, k) {
    if (k === "createLinearGradient" || k === "createRadialGradient") return () => gradient;
    if (k === "measureText") return () => ({ width: 50 });
    if (k === "canvas") return { width: 960, height: 540 };
    return () => {};
  },
  set() { return true; },
});
const canvasEl = Object.assign(fakeEl(), { getContext: () => ctxProxy });
const elements = { game: canvasEl };
const doc = {
  getElementById: (id) => elements[id] || fakeEl(),
};
class FakeAudioCtx {
  constructor() { this.currentTime = 0; this.destination = {}; this.sampleRate = 44100; }
  createOscillator() { return { type: "", frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} }; }
  createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, value: 0 }, connect() {} }; }
  createBuffer() { return { getChannelData: () => new Float32Array(8) }; }
  createBufferSource() { return { buffer: null, connect() {}, start() {} }; }
  resume() {}
}

let nowVal = 0;
const sandbox = {
  document: doc,
  window: { addEventListener() {}, AudioContext: FakeAudioCtx },
  performance: { now: () => nowVal },
  requestAnimationFrame: () => 0, // do not auto-run loop; we drive update() manually
  setTimeout: () => 0,
  console,
  Math, Date, Float32Array, Proxy, Set,
};
sandbox.globalThis = sandbox;
sandbox.window.webkitAudioContext = FakeAudioCtx;

// expose internals for driving
const exposed = src + "\n;globalThis.__T = { startMatch, update, MOVES, Keys, Pressed, triggerDragonCurse, getState: () => state, getP: () => player, getD: () => dog, getStats: () => stats };";

vm.createContext(sandbox);
vm.runInContext(exposed, sandbox, { filename: "game.js" });
const T = sandbox.__T;

let failures = 0;
function assert(cond, msg) { if (!cond) { failures++; console.error("  FAIL:", msg); } else { console.log("  ok:", msg); } }
function step(n = 1) { for (let i = 0; i < n; i++) { nowVal += 16.7; T.update(); } }
function setKeys(obj) { for (const k in T.Keys) delete T.Keys[k]; Object.assign(T.Keys, obj); }
function press(obj) { Object.assign(T.Pressed, obj); }

console.log("Scenario 1: boot + intro -> fight");
T.startMatch();
assert(T.getState() === "intro", "match starts in intro");
step(200);
assert(T.getState() === "fight", "reaches fight state after intro");

console.log("Scenario 2: 升龙诅咒 triggers on 4th dragon");
const p = T.getP();
const before = T.getStats().curses;
for (let i = 0; i < 4; i++) { p.startMove("dragon"); step(2); }
assert(T.getStats().curses === before + 1, "4th dragon triggers exactly one curse");
assert(p.cursed || p.state === "launched" || p.stun > 0, "cursed player is launched/stunned");
step(140); // let the curse land

console.log("Scenario 3: long fight runs without errors (AI + hazards + troll)");
let threw = null;
try {
  for (let i = 0; i < 4000; i++) {
    nowVal += 16.7;
    // randomly poke buttons & move so AI/learning code paths run
    if (i % 7 === 0) press({ lp: true });
    if (i % 13 === 0) press({ hp: true });
    if (i % 11 === 0) press({ up: true });
    setKeys(i % 20 < 10 ? { right: true } : { left: true });
    T.update();
  }
} catch (e) { threw = e; }
assert(!threw, "4000-frame fuzz run throws no exceptions" + (threw ? " -> " + threw.stack : ""));

console.log("Scenario 4: damage + KO ends rounds and eventually the match");
// force a quick finish by zeroing dog hp repeatedly until match ends
let guard = 0;
while (T.getState() !== "matchend" && guard++ < 30) {
  const d = T.getD(), pl = T.getP();
  if (T.getState() === "fight") { d.hp = 0; }
  step(200);
}
assert(T.getState() === "matchend", "match reaches matchend after enough KOs");

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
