// 히든 워드 공용 코드: 저장소(Firebase 또는 한 PC 시험 모드) + 단어 벡터
const HW = {};
(function () {
  const cfg = window.HW_FIREBASE || {};
  const useFb = !!cfg.apiKey;
  HW.mode = useFb ? "firebase" : "local";
  let db = null, offset = 0;
  HW.uid = null;

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src; s.onload = res;
      s.onerror = () => rej(new Error("불러오지 못했습니다: " + src));
      document.head.appendChild(s);
    });
  }

  // ---- 한 PC 시험 모드: localStorage + BroadcastChannel ----
  const mock = {
    KEY: "hw_mock", ls: [], bc: null,
    tree() { try { return JSON.parse(localStorage.getItem(this.KEY)) || {}; } catch (e) { return {}; } },
    at(t, p) {
      for (const k of p.split("/").filter(Boolean)) {
        if (t == null || typeof t !== "object") return null;
        t = t[k];
      }
      return t === undefined ? null : t;
    },
    put(t, p, v) {
      const ks = p.split("/").filter(Boolean);
      let o = t;
      for (let i = 0; i < ks.length - 1; i++) {
        if (o[ks[i]] == null || typeof o[ks[i]] !== "object") o[ks[i]] = {};
        o = o[ks[i]];
      }
      if (v === null || v === undefined) delete o[ks[ks.length - 1]];
      else o[ks[ks.length - 1]] = v;
    },
    save(t) { localStorage.setItem(this.KEY, JSON.stringify(t)); this.fire(); this.bc.postMessage(1); },
    fire() { const t = this.tree(); this.ls.slice().forEach(l => { if (this.ls.includes(l)) l.cb(this.at(t, l.p)); }); }
  };

  HW.init = async function () {
    if (useFb) {
      const b = "https://www.gstatic.com/firebasejs/10.12.2/";
      await loadScript(b + "firebase-app-compat.js");
      await loadScript(b + "firebase-auth-compat.js");
      await loadScript(b + "firebase-database-compat.js");
      firebase.initializeApp(cfg);
      const cred = await firebase.auth().signInAnonymously();
      HW.uid = cred.user.uid;
      db = firebase.database();
      db.ref(".info/serverTimeOffset").on("value", s => { offset = s.val() || 0; });
    } else {
      mock.bc = new BroadcastChannel("hw_mock");
      mock.bc.onmessage = () => mock.fire();
      let u = sessionStorage.getItem("hw_uid");
      if (!u) { u = "u" + Math.random().toString(36).slice(2, 10); sessionStorage.setItem("hw_uid", u); }
      HW.uid = u;
    }
    return HW.uid;
  };
  HW.now = () => Date.now() + offset;
  HW.set = (p, v) => useFb ? db.ref(p).set(v) : (() => { const t = mock.tree(); mock.put(t, p, v); mock.save(t); return Promise.resolve(); })();
  HW.update = (p, o) => useFb ? db.ref(p).update(o) : (() => {
    const t = mock.tree();
    for (const k in o) mock.put(t, p + "/" + k, o[k]);
    mock.save(t); return Promise.resolve();
  })();
  HW.get = (p) => useFb ? db.ref(p).get().then(s => s.val()) : Promise.resolve(mock.at(mock.tree(), p));
  HW.on = (p, cb) => {
    if (useFb) {
      const r = db.ref(p);
      const h = r.on("value", s => cb(s.val()), e => console.warn(p, e.message));
      return () => r.off("value", h);
    }
    const l = { p, cb }; mock.ls.push(l);
    cb(mock.at(mock.tree(), p));
    return () => { mock.ls = mock.ls.filter(x => x !== l); };
  };

  // ---- 공용 도우미 ----
  HW.norm = w => String(w || "").trim().replace(/\s+/g, "");
  HW.isWord = w => /^[가-힣]{1,10}$/.test(w);
  HW.list = v => v ? (Array.isArray(v) ? v.filter(x => x != null) : Object.values(v)) : [];
  HW.esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  HW.pts = stage => Math.max(1, 4 - stage);   // 1차 3점, 2차 2점, 3차부터 1점
  HW.$ = id => document.getElementById(id);
  HW.TPTS = 1;   // 아무도 못 맞힌 차수마다 출제자(선생님)가 받는 점수
  HW.simText = s => s == null ? "유사도 없음" : Number(s).toFixed(2) + "%";
  // 순위: 히든 워드와 가까운 순서(1위가 가장 가까움). 0은 히든 워드 자체.
  HW.rankText = r => r == null ? "" : r === 0 ? "정답" : r > 1000 ? "1000위 밖" : r + "위";
  HW.simRank = x => HW.simText(x.s) + (x.s != null && x.r != null ? " · " + HW.rankText(x.r) : "");
  // 공유된 단어 목록: 낸 순서(최근 것이 위) 또는 유사도순
  HW.hintsHtml = function (hs, th, bySim) {
    let a = hs.map((x, i) => Object.assign({ n: i + 1 }, x));
    a = bySim ? a.sort((x, y) => y.s - x.s) : a.reverse();
    return a.map(x => `<div class="hint ${x.s >= th ? "hit" : ""} ${x.auto ? "auto" : ""}"><div class="n">${x.n}</div>
      <div><div class="w">${HW.esc(x.w)}<small>${x.st}차${x.auto ? " · 가장 유사한 단어" : ""}${x.tch ? " · 선생님" : ""}</small></div>
      <div class="bar"><i style="width:${Math.max(0, Math.min(100, x.s))}%"></i></div></div>
      <div class="p">${x.s.toFixed(2)}%${x.r != null ? `<small>${HW.rankText(x.r)}</small>` : ""}</div></div>`).join("");
  };

  // ---- 단어 벡터(교사 화면에서만 불러옴) ----
  const D = 300;
  let words = null, V = null, idx = null, norms = null;
  HW.loadVec = async function () {
    const [wt, vb] = await Promise.all([
      fetch("vec/words.txt").then(r => { if (!r.ok) throw new Error("words.txt"); return r.text(); }),
      fetch("vec/vectors.bin").then(r => { if (!r.ok) throw new Error("vectors.bin"); return r.arrayBuffer(); })
    ]);
    words = wt.split("\n");
    V = new Int8Array(vb);
    idx = new Map(words.map((w, i) => [w, i]));
    norms = new Float32Array(words.length);
    for (let i = 0; i < words.length; i++) {
      let s = 0; const o = i * D;
      for (let j = 0; j < D; j++) s += V[o + j] * V[o + j];
      norms[i] = Math.sqrt(s) || 1;
    }
    return words.length;
  };
  HW.has = w => !!idx && idx.has(w);
  function simIdx(a, b) {
    let s = 0; const oa = a * D, ob = b * D;
    for (let j = 0; j < D; j++) s += V[oa + j] * V[ob + j];
    return s / (norms[a] * norms[b]);
  }
  // 두 단어의 유사도(%) — 코사인 유사도 × 100
  HW.sim = (a, b) => Math.round(simIdx(idx.get(a), idx.get(b)) * 10000) / 100;
  // 순위 계산에 넣는 단어인지: 자주 쓰는 단어 범위 안, 히든 워드가 들어 있지 않은 것, 조사가 붙지 않은 꼴
  function isCand(i, a) {
    const w = words[i];
    if (w.length < 2 || w === a || w.includes(a) || a.includes(w)) return false;
    if (w.length > 2 && "은는이가을를의에로와과도만".includes(w[w.length - 1]) && idx.has(w.slice(0, -1))) return false;
    return true;
  }
  // a(히든 워드)를 기준으로 w가 몇 번째로 가까운지
  let rankFor = null, rankSims = null;
  HW.rank = function (a, w) {
    if (!idx.has(a) || !idx.has(w)) return null;
    if (a === w) return 0;
    const ia = idx.get(a);
    if (rankFor !== a) {
      const lim = Math.min(words.length, 60000), arr = [];
      for (let i = 0; i < lim; i++) if (isCand(i, a)) arr.push(simIdx(ia, i));
      rankSims = Float32Array.from(arr).sort();
      rankFor = a;
    }
    const s = Math.fround(simIdx(ia, idx.get(w)));
    let lo = 0, hi = rankSims.length;            // s보다 큰 값의 개수를 이분 탐색으로 셈
    while (lo < hi) { const m = (lo + hi) >> 1; if (rankSims[m] > s) hi = m; else lo = m + 1; }
    return rankSims.length - lo + 1;
  };
  // a와 가장 비슷한 단어들(자주 쓰는 단어 범위 안에서)
  HW.nearest = function (a, k, skip) {
    const ia = idx.get(a), out = [];
    const lim = Math.min(words.length, 60000);
    for (let i = 0; i < lim; i++) {
      if (i === ia) continue;
      const w = words[i];
      if (w.length < 2 || w.includes(a) || a.includes(w) || (skip && skip(w))) continue;
      // "로봇이", "지표를"처럼 조사가 붙은 꼴은 건너뜀
      if (w.length > 2 && "은는이가을를의에로와과도만".includes(w[w.length - 1]) && idx.has(w.slice(0, -1))) continue;
      out.push([simIdx(ia, i), w]);
    }
    out.sort((x, y) => y[0] - x[0]);
    return out.slice(0, k).map(x => ({ w: x[1], s: Math.round(x[0] * 10000) / 100 }));
  };
})();
