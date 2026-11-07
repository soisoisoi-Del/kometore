/* コメトレ 文章から記録を読み取る仕組み（AIなし・端末内で動く） */
(function (root) {
  const DB = typeof module !== "undefined" && module.exports
    ? Object.assign({}, require("./foods.js"), require("./menus.js"))
    : { KT_FOODS: root.KT_FOODS, KT_EXERCISES: root.KT_EXERCISES, KT_MENUS: root.KT_MENUS || [], KT_CHAINS: root.KT_CHAINS || {} };

  const MEAL_WORDS = [
    ["朝食", "朝ごはん|朝ご飯|朝御飯|朝飯|朝食|モーニング|朝"],
    ["昼食", "昼ごはん|昼ご飯|昼御飯|昼飯|昼食|お昼|ランチ|昼"],
    ["間食", "夜食|間食|おやつ|補食"],
    ["夕食", "夜ごはん|夜ご飯|夜御飯|晩ごはん|晩ご飯|晩御飯|夕ごはん|夕ご飯|夕飯|晩飯|夜飯|夕食|ディナー|晩|夜"],
  ];
  const UNITS = "人前|スクープ|パック|切れ|切|個|枚|杯|本|皿|袋|缶|玉|丁|貫|膳|合|束|串|粒|片|尾|匹|食|箱|つ|ピース|カップ|回";
  const DELETE_RE = /^.{0,6}?(なし|無し|抜き|ぬき|消して|消す|削除|取り消|食べてない|食べなかった|飲んでない|キャンセル|いらない|間違い|まちがい)/;
  const FIX_RE = /(訂正|だった|で計算|じゃなく|じゃなかった|に変更|に直して|修正|間違えた)/;
  const PLAN_RE = /(予定|つもり|と思う|と思って|食べたい|食べよう|行こう|行く|おすすめ|何を食べ|何食べ|何をどれくらい|どれくらい食べ|足りる|大丈夫|どう[?？]|かな[?？]|[?？]\s*$)/;
  const STOP = new Set(["今日", "昨日", "一昨日", "追加", "記録", "計算", "合計", "全部", "半分", "少し", "大盛", "特盛", "並盛", "中盛", "普通", "枚切", "予定", "以外", "最初", "最後", "自重", "体重", "筋トレ", "トレーニング", "セット", "メニュー", "今回", "前回", "時間", "ジム", "練習", "食事", "一緒", "残し", "スープ", "少なめ", "多め", "大盛り", "特盛り", "自分", "感じ", "結構", "たくさん", "ちょっと", "サイズ", "トッピング", "チェーン", "コンビニ", "ファミマ", "セブン", "ローソン", "マック", "松屋", "すき家", "吉野家", "家", "外食", "自炊", "マクドナルド", "マクド", "モス", "スタバ", "サイゼ", "ガスト", "コメダ", "手作り", "レップ", "キロ", "グラム", "カロリー", "タンパク質", "たんぱく質", "ソテー", "グリル", "炒め", "煮物", "照り焼き", "塩焼き", "味付け", "手作り"]);

  function norm(s) {
    s = String(s || "").normalize("NFKC").toLowerCase();
    s = s.replace(/[×✕✖＊*]/g, "x").replace(/㎏/g, "kg");
    const kan = { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10, "ひと": 1, "ふた": 2 };
    s = s.replace(/(十[一二三四五六七八九]?|[一二三四五六七八九]十?[一二三四五六七八九]?)(?=(人前|個|枚|杯|本|皿|袋|缶|玉|丁|貫|膳|合|束|串|切れ|セット|回|つ))/g, (m) => {
      if (m.length === 1) return String(kan[m]);
      if (m[0] === "十") return String(10 + (kan[m[1]] || 0));
      return String(kan[m[0]] * 10 + (m[2] ? kan[m[2]] : 0));
    });
    s = s.replace(/(ひと|ふた)(?=(つ|切れ|口|皿|袋))/g, (m) => String(kan[m]));
    return s;
  }

  // 呼び方の一覧（長いものから照合）
  let BASE = null;
  function base() {
    if (BASE) return BASE;
    const generic = [], chainItems = [];
    DB.KT_FOODS.forEach((r) => generic.push({ f: { name: r[0], k: r[2], p: r[3], u: r[4], units: r[5] || {} }, al: r[1].split("|") }));
    (DB.KT_MENUS || []).forEach((r) => {
      const f = { name: r[0], k: r[2] / r[4] * 100, p: r[3] / r[4] * 100, u: r[4], units: r[6] || {}, chain: r[5] || "" };
      (r[5] ? chainItems : generic).push({ f, al: r[1].split("|") });
    });
    const genericSet = new Set();
    generic.forEach((g) => g.al.forEach((a) => genericSet.add(norm(a))));
    const owners = {};
    chainItems.forEach((c) => c.al.forEach((a) => { const w = norm(a.replace(/^@/, "")); (owners[w] = owners[w] || new Set()).add(c.f.chain); }));
    const globalChain = [], chainOnly = {};
    chainItems.forEach((c) => c.al.forEach((a) => {
      const w = norm(a.replace(/^@/, ""));
      const only = a[0] === "@" || genericSet.has(w) || owners[w].size > 1 || w.length < 3;
      if (only) (chainOnly[c.f.chain] = chainOnly[c.f.chain] || []).push({ w, f: c.f });
      else globalChain.push({ w, f: c.f });
    }));
    const chains = [];
    Object.entries(DB.KT_CHAINS || {}).forEach(([name, ws]) => ws.split("|").forEach((a) => chains.push({ name, w: norm(a) })));
    chains.sort((x, y) => y.w.length - x.w.length);
    BASE = { generic, globalChain, chainOnly, chains };
    return BASE;
  }
  function detectChains(text) {
    const B = base(); const found = []; const taken = new Array(text.length).fill(false);
    for (const c of B.chains) {
      let from = 0;
      for (;;) {
        const i = text.indexOf(c.w, from); if (i < 0) break; from = i + 1;
        let free = true; for (let j = i; j < i + c.w.length; j++) if (taken[j]) { free = false; break; }
        if (!free) continue;
        for (let j = i; j < i + c.w.length; j++) taken[j] = true;
        found.push({ name: c.name, s: i, e: i + c.w.length });
      }
    }
    return found.sort((a, b) => a.s - b.s);
  }
  function buildLex(myFoods, activeChains) {
    const B = base();
    const lex = [];
    B.generic.forEach((g) => g.al.forEach((a) => lex.push({ w: norm(a), type: "food", f: g.f })));
    B.globalChain.forEach((c) => lex.push({ w: c.w, type: "food", f: c.f }));
    (activeChains || []).forEach((name) => (B.chainOnly[name] || []).forEach((c) => lex.push({ w: c.w, type: "food", f: c.f, prio: 2, chainOnly: true })));
    (myFoods || []).forEach((m) => {
      const f = { name: m.name, k: m.kcal100, p: m.protein100, u: m.unitG || 100, units: {}, mine: true };
      [m.name].concat(m.aliases || []).forEach((a) => a && lex.push({ w: norm(a), type: "food", f, prio: 3 }));
    });
    DB.KT_EXERCISES.forEach((r) => {
      const e = { name: r[0], part: r[2], kind: r[3] };
      r[1].split("|").forEach((a) => lex.push({ w: norm(a), type: "ex", x: e }));
    });
    MEAL_WORDS.forEach(([meal, ws]) => ws.split("|").forEach((a) => lex.push({ w: norm(a), type: "meal", meal })));
    lex.sort((a, b) => b.w.length - a.w.length || (b.prio || 0) - (a.prio || 0));
    return lex;
  }

  function scan(text, lex) {
    const hits = [];
    const used = new Array(text.length).fill(false);
    for (const L of lex) {
      if (!L.w) continue;
      let from = 0;
      for (;;) {
        const i = text.indexOf(L.w, from);
        if (i < 0) break;
        from = i + 1;
        let free = true;
        for (let j = i; j < i + L.w.length; j++) if (used[j]) { free = false; break; }
        if (!free) continue;
        // 英字の呼び方は単語の途中では使わない
        if (/^[a-z]+$/.test(L.w) && (/[a-z]/.test(text[i - 1] || "") || /[a-z]/.test(text[i + L.w.length] || ""))) continue;
        // 「ラーメン屋」「カレー店」のようにお店を指しているときは食品にしない
        if (L.type === "food" && /^(屋|店|チェーン)/.test(text.slice(i + L.w.length))) continue;
        // カタカナの呼び方は、もっと長いカタカナ語の途中では使わない（タピオカミルクティーのミルクなど）
        if (/^[ァ-ヶー]+$/.test(L.w) && /[ァ-ヶ]/.test(text[i + L.w.length] || "")) continue;
        for (let j = i; j < i + L.w.length; j++) used[j] = true;
        hits.push({ ...L, s: i, e: i + L.w.length });
      }
    }
    hits.sort((a, b) => a.s - b.s);
    return { hits, used };
  }

  function mealByClock(d) {
    const h = d.getHours() + d.getMinutes() / 60;
    return h < 4.5 ? "間食" : h < 10.5 ? "朝食" : h < 15 ? "昼食" : h < 17 ? "間食" : "夕食";
  }

  const r1 = (v) => Math.round(v * 10) / 10;

  // 食品のあとに続く量を読む
  function readQty(text, hit, nextStart, exist) {
    const rawAfter = text.slice(hit.e, Math.min(nextStart, hit.e + 18));
    const rawBefore = text.slice(Math.max(0, hit.s - 10), hit.s);
    const bseg = rawBefore.split(/[と、,\s。やにを]/).pop();
    const f = hit.f;
    let consumed = 0;
    let after = rawAfter;
    const sl = after.match(/^\s*[をはがのも]?\s*(\d)\s*枚切り?/);
    let sliceN = sl ? +sl[1] : null;
    if (sl) { consumed = sl[0].length; after = after.slice(consumed); }
    if (!sliceN) { const sb = bseg.match(/(\d)\s*枚切り?の?$/); if (sb) sliceN = +sb[1]; }
    let amount = null, count = null, unit = "", basis = "推定", note = "", mult = 1, label = "";
    let m = after.match(/^\s*[をはがのも]?\s*(\d+(?:\.\d+)?)\s*(g|グラム|ml|ミリ|cc)/);
    if (m) { amount = +m[1]; basis = "実測"; consumed += m[0].length; }
    if (amount == null) {
      m = after.match(new RegExp("^\\s*[をはがのも]?\\s*(\\d+(?:\\.\\d+)?|半分?)\\s*(" + UNITS + ")?"));
      if (m && (m[2] || /^\s*[をはがのも]?\s*\d/.test(after)) && after[m[0].length] !== "切") {
        count = /^半/.test(m[1]) ? 0.5 : +m[1];
        unit = m[2] || "";
        consumed += m[0].length;
        if (!unit && count >= 30) { amount = count; count = null; basis = "実測"; }
      }
    }
    if (amount == null && count == null) {
      m = bseg.match(new RegExp("(\\d+(?:\\.\\d+)?)\\s*(" + UNITS + ")の?\\s*$"));
      if (m) { count = +m[1]; unit = m[2]; }
      else if ((m = bseg.match(/(\d+(?:\.\d+)?)\s*(g|グラム)の?\s*$/))) { amount = +m[1]; basis = "実測"; }
    }
    // 大盛りなど（同じ言葉のまとまりの中だけ見る）
    const aseg = rawAfter.split(/[と、,\s。や]/)[0];
    const mm = (bseg.slice(-4) + "|" + aseg).match(/特盛り?|メガ|超大盛り?|大盛り?|ダブル|中盛り?|半ライス|ハーフ|小盛り?|少なめ|ミニ/);
    if (mm) {
      const w = mm[0];
      if (/特盛|メガ|超大盛/.test(w)) { mult = 2; label = "特盛"; }
      else if (/大盛|ダブル/.test(w)) { mult = 1.5; label = "大盛り"; }
      else if (/中盛/.test(w)) { mult = 1.25; label = "中盛り"; }
      else if (/半ライス|ハーフ/.test(w)) { mult = 0.5; label = "半分"; }
      else { mult = 0.7; label = "少なめ"; }
      const ai = aseg.indexOf(w); if (ai >= 0) consumed = Math.max(consumed, ai + w.length);
    }
    let per = f.u;
    if (unit && f.units[unit]) per = f.units[unit];
    if (f.name === "食パン") {
      if (sliceN) { per = Math.round(360 / sliceN); label = sliceN + "枚切り"; mult = 1; }
      if (count == null && exist && exist.amount > 0) {
        const old = exist.name.match(/(\d)枚切り/); const oldPer = old ? Math.round(360 / +old[1]) : 60;
        count = Math.max(1, Math.round(exist.amount / oldPer));
      }
    }
    if (amount == null) {
      const n = count == null ? 1 : count;
      amount = per * n * mult;
      const unitTxt = unit || (count != null ? "つ" : "");
      if (f.name === "食パン") note = (sliceN || 6) + "枚切り" + n + "枚として推定";
      else if (count == null) note = (mult !== 1 ? label + "の" : "") + "1人前として推定";
      else note = n + unitTxt + (mult !== 1 ? "（" + label + "）" : "") + "として推定";
    } else if (mult !== 1 && basis !== "実測") amount *= mult;
    return { amount: r1(amount), basis, note, label, explicitQty: count != null || basis === "実測", consumed };
  }

  // 筋トレのセットを読む
  function readSets(span, kind) {
    const toks = [];
    const re = /(\d+(?:\.\d+)?)\s*(kg|キロ|回|レップ|reps?|セット|sets?|分|min|km|キロメートル|秒|m)?|(x)|(自重)/g;
    let m;
    while ((m = re.exec(span))) {
      if (m[3]) toks.push({ t: "x" });
      else if (m[4]) toks.push({ t: "bw" });
      else {
        let u = m[2] || "";
        if (u === "キロ") u = /^\s*(走|メートル)/.test(span.slice(re.lastIndex)) || kind === "c" ? "km" : "kg";
        if (/^reps?$|^レップ$/.test(u)) u = "回";
        if (/^sets?$/.test(u)) u = "セット";
        if (u === "min") u = "分";
        if (u === "キロメートル") u = "km";
        toks.push({ t: "n", v: +m[1], u });
      }
    }
    let kg; let minutes = 0; let km = 0; let sec = 0;
    const entries = [];
    let last = null;
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t.t === "bw") { kg = null; continue; }
      if (t.t === "x") continue;
      const prevX = toks[i - 1] && toks[i - 1].t === "x";
      if (t.u === "kg") { kg = t.v; continue; }
      if (t.u === "分") { minutes += t.v; continue; }
      if (t.u === "km") { km += t.v; continue; }
      if (t.u === "秒") { sec += t.v; continue; }
      if (t.u === "回") {
        if (prevX && last && last.repsFromX) { last.reps = t.v; continue; }
        last = { kg, reps: t.v, sets: 1 }; entries.push(last); continue;
      }
      if (t.u === "セット") { if (last) last.sets = t.v; else entries.push((last = { kg, reps: null, sets: t.v })); continue; }
      // 単位なしの数字
      if (prevX) {
        if (last && last.reps != null) { last.sets = t.v; }
        else if (last) { last.reps = t.v; }
        continue;
      }
      const nx = toks[i + 1] && toks[i + 1].t === "x" ? toks[i + 2] : null;
      const nnx = nx && toks[i + 3] && toks[i + 3].t === "x" ? toks[i + 4] : null;
      if (nx && nx.t === "n" && !nx.u && nnx && nnx.t === "n") { kg = t.v; last = { kg, reps: nx.v, sets: nnx.v }; entries.push(last); i += 4; continue; }
      if (nx && nx.t === "n" && (!nx.u || nx.u === "回")) {
        if (kg === undefined && t.v >= 20 && t.v > nx.v && kind === "w") { kg = t.v; last = { kg, reps: nx.v, sets: 1 }; entries.push(last); i += 2; continue; }
        last = { kg, reps: t.v, sets: nx.u === "回" ? 1 : nx.v }; if (nx.u === "回") { last.reps = nx.v; } entries.push(last); i += 2; continue;
      }
      if (kind === "w" && kg === undefined && t.v >= 20) { kg = t.v; continue; }
      last = { kg, reps: t.v, sets: 1 }; entries.push(last);
    }
    const sets = [];
    for (const e of entries) {
      if (!e.reps) continue;
      const k = e.kg === undefined ? (kind === "w" ? undefined : null) : e.kg;
      for (let n = 0; n < Math.min(e.sets || 1, 20); n++) sets.push({ kg: k === undefined ? null : k, reps: e.reps, guessKg: k === undefined && kind === "w" });
    }
    if (sec && !minutes) minutes = Math.max(1, Math.round(sec / 60));
    return { sets, minutes, km };
  }

  function findExisting(day, f) {
    const ws = [norm(f.name)];
    const items = (day.items || []).slice().reverse();
    return items.find((it) => ws.some((w) => norm(it.name).includes(w))) ||
      items.find((it) => norm(it.name).includes(norm(f.name).slice(0, 2)));
  }

  /* 文章 → 記録の変更 */
  function parse(textRaw, ctx) {
    const text = norm(textRaw);
    const chainHits = detectChains(text);
    const lex = buildLex(ctx.myFoods, [...new Set(chainHits.map((c) => c.name))]);
    const now = ctx.now || new Date();
    let date = ctx.date;
    if (/一昨日|おととい/.test(text)) date = ctx.shift(ctx.date, -2);
    else if (/昨日|きのう|昨晩|昨夜/.test(text)) date = ctx.shift(ctx.date, -1);
    const day = ctx.getDay(date);
    const scanned = scan(text, lex);
    let hits = scanned.hits; const used = scanned.used;
    // 店の名前そのものは食品として扱わない（その店のメニューを優先するだけ）
    hits = hits.filter((h) => !(h.type === "food" && chainHits.some((c) => h.s >= c.s && h.e <= c.e && !h.chainOnly)));
    for (const c of chainHits) for (let j = c.s; j < c.e; j++) used[j] = true;
    const actions = [], notes = [], unknown = [];
    const fix = FIX_RE.test(text);
    const plan = PLAN_RE.test(text) && !/(食べた(?!ら|い)|飲んだ|食った|追加)/.test(text);
    let meal = ctx.date === ctx.today ? mealByClock(now) : "間食";
    let mealSet = false;

    // 体重
    let wm = text.match(/体重\D{0,4}(\d{2,3}(?:\.\d+)?)/) || text.match(/^\s*(\d{2,3}(?:\.\d+)?)\s*(kg|キロ)\s*$/);
    if (wm) {
      const kg = +wm[1];
      if (kg >= 20 && kg <= 250) actions.push({ type: "weight", kg, date });
      const s = text.indexOf(wm[0]); for (let j = s; j < s + wm[0].length; j++) used[j] = true;
    }

    for (let h = 0; h < hits.length; h++) {
      const hit = hits[h];
      const next = hits[h + 1];
      const nextStart = next ? next.s : text.length;
      if (hit.type === "meal") {
        meal = hit.meal; mealSet = true;
        const rest = text.slice(hit.e, nextStart);
        if (/^\s*[はも]?\s*(なし|抜き|食べてない)/.test(rest)) { const m = rest.match(/^\s*[はも]?\s*(なし|抜き|食べてない)/); for (let j = hit.e; j < hit.e + m[0].length; j++) used[j] = true; }
        continue;
      }
      if (hit.type === "ex") {
        let end = text.length;
        if (next) end = next.s;
        const nl = text.slice(hit.e).search(/[\n。]/); if (nl >= 0) end = Math.min(end, hit.e + nl);
        const span = text.slice(hit.e, end);
        for (let j = hit.e; j < end; j++) used[j] = true;
        let r = readSets(span, hit.x.kind);
        if (!r.sets.length && !r.minutes && !r.km) {
          const prevEnd = h > 0 ? hits[h - 1].e : 0;
          const pre = text.slice(prevEnd, hit.s);
          const r2 = readSets(pre, hit.x.kind);
          if (r2.sets.length || r2.minutes || r2.km) { r = r2; for (let j = prevEnd; j < hit.s; j++) used[j] = true; }
        }
        if (DELETE_RE.test(span) ) {
          const w = (day.workouts || []).slice().reverse().find((x) => x.name === hit.x.name);
          if (w) actions.push({ type: "workout_remove", id: w.id, date });
          continue;
        }
        if (hit.x.kind === "c") {
          if (!r.minutes && !r.km) { notes.push(hit.x.name + "は時間（例: 30分）も送ると記録できます"); continue; }
          actions.push({ type: "workout_add", date, name: hit.x.name, part: hit.x.part, sets: [], minutes: r.minutes || Math.round(r.km * 6), note: r.km ? r.km + "km" : "" });
          continue;
        }
        if (!r.sets.length && !r.minutes) { notes.push(hit.x.name + "は回数も送ってください（例: " + hit.x.name + " 60kg 10回×3）"); continue; }
        if (r.sets.some((s) => s.guessKg)) notes.push(hit.x.name + "は重さが分からなかったので回数だけ記録しました");
        const existing = fix ? (day.workouts || []).slice().reverse().find((x) => x.name === hit.x.name) : null;
        const sets = r.sets.map((s) => ({ kg: s.kg, reps: s.reps }));
        if (existing) actions.push({ type: "workout_update", id: existing.id, date, sets, minutes: r.minutes || undefined });
        else actions.push({ type: "workout_add", date, name: hit.x.name, part: hit.x.part, sets, minutes: r.minutes || 0, note: "" });
        continue;
      }
      // 食品
      const f = hit.f;
      if (f.name === "おでん" && hits.some((x) => x !== hit && x.type === "food")) continue;
      const tail = text.slice(hit.e, Math.min(nextStart, hit.e + 10));
      if (DELETE_RE.test(tail) && !/^\s*[をはがの]?\s*\d/.test(tail)) {
        const dm = tail.match(DELETE_RE); for (let j = hit.e; j < hit.e + dm[0].length; j++) used[j] = true;
        const ex = findExisting(day, f);
        if (ex) actions.push({ type: "remove", id: ex.id, date });
        else notes.push(f.name + "は記録にありませんでした");
        continue;
      }
      // 「コーヒーに牛乳」のコーヒーや「パンは〜」のように、すでにある食品の説明なら追加しない
      const exist = findExisting(day, f);
      const q = readQty(text, hit, nextStart, fix ? exist : null);
      for (let j = hit.e; j < Math.min(nextStart, hit.e + q.consumed); j++) used[j] = true;
      if (/^\s*に/.test(tail) && next && next.type === "food" && next.s - hit.e <= 4) continue;
      if (exist && /^\s*は/.test(tail) && !q.explicitQty && !q.label) continue;
      let amount = q.amount, note = q.note, name = f.name + (q.label ? "（" + q.label + "）" : "");
      if (f.name === "牛乳" && !q.explicitQty && /(コーヒー|紅茶|珈琲|ラテ).{0,4}$/.test(text.slice(Math.max(0, hit.s - 8), hit.s))) {
        amount = 20; name = "牛乳（コーヒーに）"; note = "少し入れたとして推定";
      }
      if (f.name === "中華麺" && /替え玉/.test(text.slice(hit.s, hit.e + 1))) { name = "替え玉"; note = "1玉として推定"; }
      if (fix && exist) {
        actions.push({ type: "update", id: exist.id, date, name, amount_g: amount, kcal_per_100g: f.k, protein_per_100g: f.p, basis: q.basis, note });
      } else {
        actions.push({ type: "add", date, meal, name, amount_g: amount, kcal_per_100g: f.k, protein_per_100g: f.p, basis: (f.mine || f.chain) && q.basis === "推定" ? "表示" : q.basis, note: f.chain && /1人前として推定/.test(note) ? "お店の栄養成分の目安" : note });
      }
    }

    // 表にない言葉
    let rest = "";
    for (let j = 0; j < text.length; j++) rest += used[j] ? " " : text[j];
    const runs = rest.match(/[ァ-ヶー一-龠々]{2,}|[a-z]{3,}/g) || [];
    for (const r of runs) {
      const w = r;
      if (w.length < 2 || STOP.has(w) || [...STOP].some((s) => w.includes(s) && s.length >= 2 && w.length <= s.length + 1)) continue;
      if (/^(食べ|飲ん|乗っ|入れ|付け|追加|半分|全部|今日|昨日|残し|頑張|行っ|買っ|作っ|多め|少な)/.test(w) || /(屋|店)$/.test(w)) continue;
      if (!unknown.includes(w)) unknown.push(w);
    }
    return { date, actions, notes, unknown: unknown.slice(0, 4), plan, mealSet };
  }

  /* 1日の合計から、ひとこと評価と次に食べるものを作る */
  const SUGGEST = [
    { food: "プロテイン（牛乳200ml割り）", amount: "1杯", kcal: 242, protein: 29.1, pr: 3 },
    { food: "サラダチキン", amount: "1個", kcal: 116, protein: 26.4, pr: 3 },
    { food: "ゆで卵", amount: "2個", kcal: 134, protein: 12.5, pr: 2 },
    { food: "ギリシャヨーグルト", amount: "1個", kcal: 79, protein: 11.3, pr: 2 },
    { food: "納豆", amount: "1パック", kcal: 86, protein: 7.4, pr: 1 },
    { food: "ご飯（大盛り）", amount: "1杯", kcal: 351, protein: 5.6, pr: 0, carb: true },
    { food: "おにぎり", amount: "2個", kcal: 385, protein: 7.0, pr: 0, carb: true },
    { food: "バナナ", amount: "1本", kcal: 93, protein: 1.1, pr: 0, carb: true },
    { food: "ミックスナッツ", amount: "1袋（25g）", kcal: 152, protein: 4.8, pr: 0, carb: true },
    { food: "牛乳", amount: "1杯（200ml）", kcal: 122, protein: 6.6, pr: 1, carb: true },
  ];

  function evaluate(t, st, hasWorkout, hour) {
    const k = Math.round(t.kcal), p = Math.round(t.protein * 10) / 10;
    const kGap = Math.round(st.kcalMin - t.kcal), pGap = Math.round((st.pMin - t.protein) * 10) / 10;
    const ev = {};
    ev.kcal = k < st.kcalMin ? `合計 ${k.toLocaleString()} kcal。目標まであと ${kGap.toLocaleString()} kcal です。` : k > st.kcalMax ? `合計 ${k.toLocaleString()} kcal で、目標の上限を ${(k - st.kcalMax).toLocaleString()} kcal 超えています。` : `合計 ${k.toLocaleString()} kcal で、目標の範囲に入りました。`;
    ev.protein = t.protein < st.pMin ? `たんぱく質は ${p} g。あと ${pGap} g 欲しいところです。` : t.protein > st.pMax ? `たんぱく質は ${p} g で、十分取れています。` : `たんぱく質は ${p} g で、目標の範囲です。`;
    if (kGap <= 0 && pGap <= 0) ev.improve = "今日の目標は達成です。この調子で続けましょう。";
    else if (hasWorkout && pGap > 0) ev.improve = "筋トレをした日なので、寝る前までにたんぱく質を足せると回復に効きます。";
    else if (kGap > 800 && hour >= 18) ev.improve = "夜で量を稼ぐなら、ご飯の大盛りや牛乳のように量を増やしやすいものが楽です。";
    else if (pGap > 30) ev.improve = "たんぱく質が足りていないので、次の食事で肉・魚・卵を1品足しましょう。";
    else if (kGap > 0) ev.improve = "カロリーがもう少し欲しいので、間食におにぎりやナッツを足すのがおすすめです。";
    else ev.improve = "たんぱく質をもう少し足せると完璧です。";
    const suggest = [];
    let kg = kGap, pg = pGap;
    const pool = SUGGEST.slice();
    while ((kg > 60 || pg > 3) && suggest.length < 4 && pool.length) {
      pool.sort((a, b) => score(b) - score(a));
      const s = pool.shift();
      if (score(s) <= 0) break;
      suggest.push({ food: s.food, amount: s.amount, kcal: s.kcal, protein: s.protein });
      kg -= s.kcal; pg -= s.protein;
    }
    function score(s) {
      let v = 0;
      if (pg > 3) v += Math.min(s.protein, pg) * 6;
      if (kg > 60) v += Math.min(s.kcal, kg) * 0.08;
      if (kg <= 0) v -= s.kcal * 0.05;
      return v;
    }
    return { evaluation: ev, suggest };
  }

  const KT = { parse, evaluate, norm, buildLex, readSets };
  if (typeof module !== "undefined") module.exports = KT; else root.KT = KT;
})(typeof window !== "undefined" ? window : globalThis);
