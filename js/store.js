// 記録：その iPad のブラウザの中だけ（localStorage）。
// 残すのは、コースごとの「どの面まで進んだか（reached）」「各面のいちばんよい★（stars）」と、
// ランダムコースの「いちばんよい★の合計（random）」だけ。
// localStorage が使えないとき（プライベートブラウズなど）は、メモリの中だけで遊べる。
const Store = (() => {
  const KEY = 'graph-golf-v1';
  const KINDS = ['prop', 'inv'];
  const course = () => ({ reached: 0, stars: Array(HOLES).fill(0) });
  const blank = () => ({ prop: course(), inv: course(), random: { prop: 0, inv: 0 } });
  let data = blank();

  const okStars = s => (Number.isInteger(s) && s >= 0 && s <= 3 ? s : 0);
  const readCourse = c => {
    if (!c || typeof c !== 'object') return course();
    const reached = Number.isInteger(c.reached) ? Math.min(Math.max(c.reached, 0), HOLES) : 0;
    const stars = Array.from({ length: HOLES }, (_, i) => okStars(Array.isArray(c.stars) ? c.stars[i] : 0));
    return { reached, stars };
  };
  const okTotal = n => (Number.isInteger(n) && n >= 0 && n <= HOLES * 3 ? n : 0);

  function load() {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d && Array.isArray(d.stars) && !d.prop) {
        // 比例だけだったころの記録を引きつぐ
        data = blank();
        data.prop = readCourse(d);
        return;
      }
      data = {
        prop: readCourse(d.prop),
        inv: readCourse(d.inv),
        random: { prop: okTotal(d.random && d.random.prop), inv: okTotal(d.random && d.random.inv) },
      };
    } catch (e) { /* 読めなければ新しく始める */ }
  }

  function save() {
    try { window.localStorage.setItem(KEY, JSON.stringify(data)); }
    catch (e) { /* 残せないだけ。遊ぶのはそのまま */ }
  }

  return {
    load,
    reached: kind => data[kind].reached,
    bestStars: (kind, i) => data[kind].stars[i],
    total: kind => data[kind].stars.reduce((a, b) => a + b, 0),
    hasAny: () => KINDS.some(k => data[k].reached > 0 || data[k].stars.some(s => s > 0) || data.random[k] > 0),
    restart(kind) { data[kind].reached = 0; save(); },
    finishStage(kind, i, stars) {
      data[kind].stars[i] = Math.max(data[kind].stars[i], stars);
      data[kind].reached = i + 1;
      save();
    },
    randomBest: kind => data.random[kind],
    finishRandom(kind, total) {
      const before = data.random[kind];
      data.random[kind] = Math.max(before, total);
      save();
      return before;
    },
    clear() {
      data = blank();
      try { window.localStorage.removeItem(KEY); } catch (e) { /* なにもしない */ }
    },
  };
})();
