// グラフ（芝のコース）を SVG で描く。大きさや向きが変わったら、いまの状態から描き直す。
//   比例   y ＝ k × x … 原点から右上へのまっすぐな線
//   反比例 y ＝ k ÷ x … 上の端から右下へ下りる曲線
const Graph = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const M = { L: 50, R: 22, T: 18, B: 42 };   // 目盛りの数字のための余白（px）
  const SPEED = 520;                            // ボールの速さ（px/秒）
  const BALL_R = 11;
  const { xMax, yMax } = RANGE;

  let svg, geo;
  let stage = null;     // { x, y, kind }
  let misses = [];      // 外れた □ の値
  let shot = null;      // { k, x, x0, xEnd, hit, phase:'roll'|'in'|'done', r }
  let ended = null;     // 面が終わったとき { showLine: bool }
  let hint = false;     // 2打目を外したあとの手がかり（比例：x＝1 の線、反比例：長方形）
  let raf = 0;
  let refs = {};

  const el = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };

  const isProp = () => stage.kind === 'prop';
  const f = (k, x) => (isProp() ? k * x : k / x);
  const slope = (k, x) => (isProp() ? k : -k / (x * x));
  // 線がコースの中に見えている x の範囲 [はじめ, おわり]
  const span = k => (isProp() ? [0, Math.min(xMax, yMax / k)] : [Math.min(xMax, k / yMax), xMax]);

  function measure() {
    const r = svg.getBoundingClientRect();
    const W = Math.max(200, r.width), H = Math.max(200, r.height);
    // x と y の1目もりは同じ長さ（正方形の方眼）。入りきらない向きは真ん中に寄せる
    const u = Math.max(4, Math.min((W - M.L - M.R) / xMax, (H - M.T - M.B) / yMax));
    const pw = u * xMax, ph = u * yMax;
    const ox = M.L + (W - M.L - M.R - pw) / 2, oy = M.T + (H - M.T - M.B - ph) / 2;
    geo = {
      W, H, pw, ph, u,
      X: x => ox + x * u,
      Y: y => oy + ph - y * u,
    };
  }

  // 1目もり u px のときに SVG が必要とする大きさ
  const sizeFor = u => ({ w: u * xMax + M.L + M.R, h: u * yMax + M.T + M.B });

  // x0 から x1 までの線（反比例は x を等比にとって、急なところも なめらかに）
  function pathD(k, x0, x1) {
    const { X, Y } = geo;
    if (!(x1 > x0)) return '';
    if (isProp()) return `M${X(x0)} ${Y(f(k, x0))}L${X(x1)} ${Y(f(k, x1))}`;
    const n = 90;
    let d = '';
    for (let i = 0; i <= n; i++) {
      const x = x0 * Math.pow(x1 / x0, i / n);
      d += `${i ? 'L' : 'M'}${X(x).toFixed(1)} ${Y(f(k, x)).toFixed(1)}`;
    }
    return d;
  }

  function render() {
    if (!svg || !stage) return;
    measure();
    const { W, H, X, Y } = geo;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.textContent = '';

    // 芝（1目もりごとに刈り目の色を変える）
    for (let i = 0; i < xMax; i++) {
      el('rect', { x: X(i), y: Y(yMax), width: geo.u + 0.5, height: geo.ph, class: i % 2 ? 'turf b' : 'turf a' }, svg);
    }

    // 手がかり（方眼の下に敷く）
    if (hint && !ended) {
      if (isProp()) {
        el('rect', { x: X(1) - 7, y: Y(yMax), width: 14, height: geo.ph, rx: 7, class: 'hintband' }, svg);
      } else {
        el('rect', { x: X(0), y: Y(stage.y), width: stage.x * geo.u, height: stage.y * geo.u, class: 'hintrect' }, svg);
      }
    }

    const grid = el('g', {}, svg);
    for (let i = 0; i <= xMax; i++) {
      el('line', { x1: X(i), y1: Y(0), x2: X(i), y2: Y(yMax), class: i % 5 ? 'grid' : 'grid5' }, grid);
    }
    for (let j = 0; j <= yMax; j++) {
      el('line', { x1: X(0), y1: Y(j), x2: X(xMax), y2: Y(j), class: j % 5 ? 'grid' : 'grid5' }, grid);
    }
    el('line', { x1: X(0), y1: Y(0), x2: X(xMax), y2: Y(0), class: 'axis' }, grid);
    el('line', { x1: X(0), y1: Y(0), x2: X(0), y2: Y(yMax), class: 'axis' }, grid);
    if (hint && !ended && isProp()) {
      el('line', { x1: X(1), y1: Y(0), x2: X(1), y2: Y(yMax), class: 'hintline' }, svg);
    }

    // 目もりの数字：x も y も1ごと
    const ticks = el('g', { class: 'ticks' }, svg);
    for (let i = 1; i <= xMax; i++) {
      el('text', { x: X(i), y: Y(0) + 30, 'text-anchor': 'middle', class: hint && !ended && isProp() && i === 1 ? 'hot' : '' }, ticks).textContent = i;
    }
    for (let j = 1; j <= yMax; j++) {
      el('text', { x: X(0) - 9, y: Y(j) + 7, 'text-anchor': 'end' }, ticks).textContent = j;
    }
    el('text', { x: X(0) - 9, y: Y(0) + 30, 'text-anchor': 'end' }, ticks).textContent = '0';

    // 外れた線（うすく残す）と、その □ の数
    const missG = el('g', { class: 'misses' }, svg);
    misses.forEach(k => {
      const [x0, xe] = span(k);
      const d = pathD(k, x0, xe);
      if (d) el('path', { d, class: 'miss' }, missG);
      let lx, ly, anchor;
      if (!d) {                                 // コースに出てこない（□ が大きすぎる反比例）
        lx = X(xMax) - 6; ly = Y(yMax) + 26; anchor = 'end';
      } else if (!isProp() && Math.sqrt(k) <= xMax) {
        // 反比例：曲線のいちばん曲がったところ（x＝y の点）の右上に書く。□ ごとに場所がずれて重なりにくい
        const s = Math.sqrt(k);
        lx = X(s) + 8; ly = Y(s) - 8; anchor = 'start';
      } else if (isProp() && xe < xMax) {       // 比例で上の端に出る
        lx = X(xe) + 6; ly = Y(yMax) + 20; anchor = 'start';
      } else {                                  // 右の端に出る
        const ye = f(k, xe);
        const nearTop = ye > yMax - 1;
        lx = X(xe) - (nearTop ? 14 : 4); ly = Y(ye) + (nearTop ? 30 : -10); anchor = 'end';
      }
      el('text', { x: lx, y: ly, 'text-anchor': anchor, class: 'misslabel' }, missG).textContent = k;
    });

    // 面が終わったら：カップから軸へ点線（座標の読み方）と、答えの線
    if (ended) {
      const ans = answerOf(stage.kind, stage);
      if (ended.showLine) {
        const [x0, xe] = span(ans);
        el('path', { d: pathD(ans, x0, xe), class: 'answer' }, svg);
      }
      el('line', { x1: X(stage.x), y1: Y(stage.y), x2: X(stage.x), y2: Y(0), class: 'guide' }, svg);
      el('line', { x1: X(stage.x), y1: Y(stage.y), x2: X(0), y2: Y(stage.y), class: 'guide' }, svg);
      el('circle', { cx: X(stage.x), cy: Y(0), r: 16, class: 'guidemark' }, svg);
      el('circle', { cx: X(0), cy: Y(stage.y), r: 16, class: 'guidemark' }, svg);
    }

    // 今の一打の線
    refs.shotLine = el('path', { d: '', class: 'shot' }, svg);

    // カップと旗
    const cx = X(stage.x), cy = Y(stage.y);
    const inCup = shot && shot.hit && shot.phase !== 'roll';
    refs.cup = el('ellipse', { cx, cy, rx: 17, ry: 10, class: 'cup' + (inCup ? ' cupin' : '') }, svg);
    const pole = 56;
    const up = cy - pole - 4 >= 0;           // 上に旗を立てる場所がないときは、下へ下げる
    const fy = up ? cy - pole : cy + pole;
    el('line', { x1: cx, y1: up ? cy - 6 : cy + 6, x2: cx, y2: fy, class: 'pole' }, svg);
    refs.flag = el('path', {
      d: up ? `M${cx} ${fy} l36 11 l-36 11 z` : `M${cx} ${fy} l36 -11 l-36 -11 z`,
      class: 'flag' + (inCup ? ' wave' : ''),
    }, svg);
    el('circle', { cx, cy, r: 3.5, class: 'cupdot' }, svg);

    refs.ball = el('circle', { cx: X(0), cy: Y(0), r: BALL_R, class: 'ball' }, svg);
    updateShot();
  }

  function updateShot() {
    const { X, Y } = geo;
    if (!shot) {
      // 打つ前のボール：比例は原点、反比例は見えない（上の端から出てくる）
      refs.ball.setAttribute('cx', X(0));
      refs.ball.setAttribute('cy', Y(0));
      refs.ball.setAttribute('r', ended || !isProp() ? 0 : BALL_R);
      refs.shotLine.setAttribute('visibility', 'hidden');
      return;
    }
    const x = shot.x;
    const visible = shot.xEnd > shot.x0;
    const lineVisible = visible && !(shot.phase === 'done' && !shot.hit);
    refs.shotLine.setAttribute('visibility', lineVisible ? 'visible' : 'hidden');
    refs.shotLine.setAttribute('d', pathD(shot.k, shot.x0, x));
    refs.ball.setAttribute('cx', X(x));
    refs.ball.setAttribute('cy', Y(f(shot.k, x)));
    refs.ball.setAttribute('r', !visible || (ended && !shot.hit) ? 0 : shot.r);
    refs.ball.classList.toggle('stopped', shot.phase === 'done' && !shot.hit);
  }

  function shoot(k, hit, onDone) {
    cancelAnimationFrame(raf);
    const [x0, xe] = span(k);
    shot = { k, x: x0, x0, xEnd: hit ? stage.x : xe, hit, phase: 'roll', r: BALL_R };
    render();
    const missed = () => {
      shot.phase = 'done';
      updateShot();
      setTimeout(() => { misses.push(shot.k); render(); onDone(); }, 350);
    };
    if (!(shot.xEnd > shot.x0)) { missed(); return; }   // コースに出てこない線
    let last = performance.now();
    let inStart = 0;
    const step = now => {
      const dt = Math.min(0.2, (now - last) / 1000);
      last = now;
      if (shot.phase === 'roll') {
        // 線にそって一定の速さ：x の進みは「1目もりあたりの長さ」でわる
        const pxPerUnit = geo.u * Math.hypot(1, slope(shot.k, Math.max(shot.x, 0.01)));
        shot.x = Math.min(shot.xEnd, shot.x + (SPEED * dt) / pxPerUnit);
        if (shot.x >= shot.xEnd) {
          if (shot.hit) {
            shot.phase = 'in';
            inStart = now;
            refs.cup.classList.add('cupin');
            refs.flag.classList.add('wave');
          } else {
            missed();
            return;
          }
        }
      } else if (shot.phase === 'in') {
        const t = Math.min(1, (now - inStart) / 380);
        shot.r = BALL_R * (1 - t);
        if (t >= 1) {
          shot.phase = 'done';
          updateShot();
          setTimeout(onDone, 250);
          return;
        }
      }
      updateShot();
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  return {
    init(svgEl) {
      svg = svgEl;
      new ResizeObserver(() => render()).observe(svg);
      window.addEventListener('orientationchange', () => setTimeout(render, 300));
    },
    setStage(s) {
      cancelAnimationFrame(raf);
      stage = s; misses = []; shot = null; ended = null; hint = false;
      render();
    },
    shoot,
    showHint() { hint = true; render(); },
    // 使える広さ（SVG に使える幅・高さ）から、正方形の方眼がいちばん大きく入る SVG の大きさを返す
    fit(availW, availH) {
      const u = Math.max(4, Math.min((availW - M.L - M.R) / xMax, (availH - M.T - M.B) / yMax));
      return sizeFor(u);
    },
    end(showLine) { ended = { showLine }; render(); },
    render,
  };
})();
