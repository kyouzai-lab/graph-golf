// コースとステージのデータ。面を足す・変えるときはここだけ直す。
// カップは方眼の交点（x, y とも整数）に置く。
//   比例   y ＝ □ × x … 答え □ ＝ y ÷ x
//   反比例 y ＝ □ ÷ x … 答え □ ＝ x × y
const RANGE = { xMax: 10, yMax: 20 };
const TRIES = 3;      // 1面で打てる回数
const EPS = 0.001;    // 小数の誤差はここまで同じとみなす
const HOLES = 10;     // 1コースのホール数

const COURSES = {
  prop: {
    name: '比例',
    op: '×',
    stages: [
      { x: 5, y: 10, note: '慣れる' },
      { x: 4, y: 12, note: '' },
      { x: 6, y: 6, note: '□＝1' },
      { x: 3, y: 15, note: '急な線' },
      { x: 2, y: 8, note: '' },
      { x: 5, y: 20, note: '5面と同じ □ で、ちがう点を通ると気づく' },
      { x: 2, y: 3, note: 'ここから小数' },
      { x: 4, y: 10, note: '' },
      { x: 8, y: 4, note: 'ゆるい線' },
      { x: 6, y: 9, note: '7面と同じ □' },
    ],
  },
  inv: {
    name: '反比例',
    op: '÷',
    stages: [
      { x: 2, y: 6, note: '慣れる' },
      { x: 4, y: 5, note: '' },
      { x: 3, y: 4, note: '1面と同じ □ で、ちがう点を通ると気づく' },
      { x: 1, y: 8, note: 'x＝1 のとき y＝□' },
      { x: 6, y: 3, note: '' },
      { x: 9, y: 2, note: '5面と同じ □' },
      { x: 5, y: 6, note: '大きい □ は曲線が右上へはなれる' },
      { x: 10, y: 3, note: '7面と同じ □' },
      { x: 4, y: 1, note: '小さい □ は原点の近く' },
      { x: 8, y: 5, note: 'いちばん大きい □' },
    ],
  },
};

const answerOf = (kind, s) => (kind === 'prop' ? s.y / s.x : s.x * s.y);

// ランダムコース：毎回ちがう交点にカップを置く（同じカップは1回だけ・同じ □ は2回まで）
function randomStages(kind, n = HOLES) {
  const cands = [];
  for (let x = 2; x <= RANGE.xMax; x++) {
    for (let y = 1; y <= RANGE.yMax; y++) {
      const a = answerOf(kind, { x, y });
      if (kind === 'prop') {
        // □ は 0.5 きざみで 0.5〜10（小数は .5 だけ）
        if (Math.abs(a * 2 - Math.round(a * 2)) > 1e-9 || a < 0.5 || a > 10) continue;
      } else if (a < 4 || a > 60 || y < 2) continue;   // y＝1 は曲線が x 軸にはりついて見えにくい
      cands.push({ x, y, a });
    }
  }
  for (let i = cands.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cands[i], cands[j]] = [cands[j], cands[i]];
  }
  const out = [], count = {};
  for (const c of cands) {
    if ((count[c.a] || 0) >= 2) continue;
    count[c.a] = (count[c.a] || 0) + 1;
    out.push({ x: c.x, y: c.y, note: 'ランダム' });
    if (out.length === n) break;
  }
  return out;
}
