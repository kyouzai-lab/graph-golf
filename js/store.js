// 記録：その iPad のブラウザの中だけ（localStorage）。
// 残すのは「どの面まで進んだか（reached）」と「各面のいちばんよい★（stars）」だけ。
// localStorage が使えないとき（プライベートブラウズなど）は、メモリの中だけで遊べる。
const Store = (() => {
  const KEY = 'graph-golf-v1';
  const blank = () => ({ reached: 0, stars: STAGES.map(() => 0) });
  let data = blank();

  function load() {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      const reached = Number.isInteger(d.reached) ? Math.min(Math.max(d.reached, 0), STAGES.length) : 0;
      const stars = STAGES.map((_, i) => {
        const s = Array.isArray(d.stars) ? d.stars[i] : 0;
        return Number.isInteger(s) && s >= 0 && s <= 3 ? s : 0;
      });
      data = { reached, stars };
    } catch (e) { /* 読めなければ新しく始める */ }
  }

  function save() {
    try { window.localStorage.setItem(KEY, JSON.stringify({ reached: data.reached, stars: data.stars })); }
    catch (e) { /* 残せないだけ。遊ぶのはそのまま */ }
  }

  return {
    load,
    get reached() { return data.reached; },
    bestStars(i) { return data.stars[i]; },
    total() { return data.stars.reduce((a, b) => a + b, 0); },
    restart() { data.reached = 0; save(); },
    finishStage(i, stars) {
      data.stars[i] = Math.max(data.stars[i], stars);
      data.reached = i + 1;
      save();
    },
    clear() {
      data = blank();
      try { window.localStorage.removeItem(KEY); } catch (e) { /* なにもしない */ }
    },
  };
})();
