// グラフ（芝のコース）を SVG で描く。大きさや向きが変わったら、いまの状態から描き直す。
const Graph = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const M = { L: 50, R: 22, T: 18, B: 42 };   // 目盛りの数字のための余白（px）
  const SPEED = 520;                            // ボールの速さ（px/秒）
  const BALL_R = 11;

  let svg, geo;
  let stage = null;
  let misses = [];      // 外れた □ の値
  let shot = null;      // { k, x, xEnd, hit, phase:'roll'|'in'|'done', r }
  let ended = null;     // 面が終わったとき { showLine: bool }
  let raf = 0;
  let refs = {};

  const el = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };

  function measure() {
    const r = svg.getBoundingClientRect();
    const W = Math.max(200, r.width), H = Math.max(200, r.height);
    // x と y の1目もりは同じ長さ（正方形の方眼）。入りきらない向きは真ん中に寄せる
    const u = Math.max(4, Math.min((W - M.L - M.R) / RANGE.xMax, (H - M.T - M.B) / RANGE.yMax));
    const pw = u * RANGE.xMax, ph = u * RANGE.yMax;
    const ox = M.L + (W - M.L - M.R - pw) / 2, oy = M.T + (H - M.T - M.B - ph) / 2;
    geo = {
      W, H, pw, ph, sx: u, sy: u,
      X: x => ox + x * u,
      Y: y => oy + ph - y * u,
    };
  }

  // 1目もり u px のときに SVG が必要とする大きさ
  const sizeFor = u => ({ w: u * RANGE.xMax + M.L + M.R, h: u * RANGE.yMax + M.T + M.B });

  // 原点から y＝k×x の線がコースの端に出るところの x
  const edgeX = k => Math.min(RANGE.xMax, RANGE.yMax / k);

  function render() {
    if (!svg || !stage) return;
    measure();
    const { W, H, X, Y } = geo;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.textContent = '';

    // 芝（1目もりごとに刈り目の色を変える）
    for (let i = 0; i < RANGE.xMax; i++) {
      el('rect', { x: X(i), y: Y(RANGE.yMax), width: geo.sx + 0.5, height: geo.ph, class: i % 2 ? 'turf b' : 'turf a' }, svg);
    }
    const grid = el('g', {}, svg);
    for (let i = 0; i <= RANGE.xMax; i++) {
      el('line', { x1: X(i), y1: Y(0), x2: X(i), y2: Y(RANGE.yMax), class: i % 5 ? 'grid' : 'grid5' }, grid);
    }
    for (let j = 0; j <= RANGE.yMax; j++) {
      el('line', { x1: X(0), y1: Y(j), x2: X(RANGE.xMax), y2: Y(j), class: j % 5 ? 'grid' : 'grid5' }, grid);
    }
    el('line', { x1: X(0), y1: Y(0), x2: X(RANGE.xMax), y2: Y(0), class: 'axis' }, grid);
    el('line', { x1: X(0), y1: Y(0), x2: X(0), y2: Y(RANGE.yMax), class: 'axis' }, grid);

    // 目もりの数字：x は1ごと、y は2ごと
    const ticks = el('g', { class: 'ticks' }, svg);
    for (let i = 1; i <= RANGE.xMax; i++) {
      el('text', { x: X(i), y: Y(0) + 30, 'text-anchor': 'middle' }, ticks).textContent = i;
    }
    for (let j = 2; j <= RANGE.yMax; j += 2) {
      el('text', { x: X(0) - 9, y: Y(j) + 7, 'text-anchor': 'end' }, ticks).textContent = j;
    }
    el('text', { x: X(0) - 9, y: Y(0) + 30, 'text-anchor': 'end' }, ticks).textContent = '0';

    // 外れた線（うすく残す）と、その □ の数
    const missG = el('g', { class: 'misses' }, svg);
    misses.forEach(k => {
      const xe = edgeX(k);
      el('line', { x1: X(0), y1: Y(0), x2: X(xe), y2: Y(k * xe), class: 'miss' }, missG);
      const atTop = xe < RANGE.xMax;
      const corner = !atTop && k * xe > RANGE.yMax - 1;   // 右上のかどに近いときは、線の下側に書く
      el('text', {
        x: X(xe) + (atTop ? 6 : corner ? -14 : -4),
        y: Y(k * xe) + (atTop ? 20 : corner ? 30 : -10),
        'text-anchor': atTop ? 'start' : 'end',
        class: 'misslabel',
      }, missG).textContent = k;
    });

    // 面が終わったら：カップから軸へ点線（座標の読み方）と、答えの線
    if (ended) {
      const ans = stage.y / stage.x;
      if (ended.showLine) {
        const xe = edgeX(ans);
        el('line', { x1: X(0), y1: Y(0), x2: X(xe), y2: Y(ans * xe), class: 'answer' }, svg);
      }
      el('line', { x1: X(stage.x), y1: Y(stage.y), x2: X(stage.x), y2: Y(0), class: 'guide' }, svg);
      el('line', { x1: X(stage.x), y1: Y(stage.y), x2: X(0), y2: Y(stage.y), class: 'guide' }, svg);
      el('circle', { cx: X(stage.x), cy: Y(0), r: 16, class: 'guidemark' }, svg);
      el('circle', { cx: X(0), cy: Y(stage.y), r: 16, class: 'guidemark' }, svg);
      if (stage.y % 2) {  // 2ごとの目もりに数字がないときは、y の数字を足して見せる
        el('text', { x: X(0) - 9, y: Y(stage.y) + 7, 'text-anchor': 'end', class: 'guidetext' }, svg).textContent = stage.y;
      }
    }

    // 今の一打の線
    refs.shotLine = el('line', { x1: X(0), y1: Y(0), x2: X(0), y2: Y(0), class: 'shot' }, svg);

    // カップと旗
    const cx = X(stage.x), cy = Y(stage.y);
    refs.cup = el('ellipse', { cx, cy, rx: 17, ry: 10, class: 'cup' + (shot && shot.hit && shot.phase !== 'roll' ? ' cupin' : '') }, svg);
    const pole = 56;
    const up = cy - pole - 4 >= 0;           // 上に旗を立てる場所がないときは、下へ下げる
    const fy = up ? cy - pole : cy + pole;
    el('line', { x1: cx, y1: up ? cy - 6 : cy + 6, x2: cx, y2: fy, class: 'pole' }, svg);
    refs.flag = el('path', {
      d: up ? `M${cx} ${fy} l36 11 l-36 11 z` : `M${cx} ${fy} l36 -11 l-36 -11 z`,
      class: 'flag' + (shot && shot.hit && shot.phase !== 'roll' ? ' wave' : ''),
    }, svg);
    el('circle', { cx, cy, r: 3.5, class: 'cupdot' }, svg);

    refs.ball = el('circle', { cx: X(0), cy: Y(0), r: BALL_R, class: 'ball' }, svg);
    updateShot();
  }

  function updateShot() {
    const { X, Y } = geo;
    if (!shot) {
      refs.ball.setAttribute('cx', X(0));
      refs.ball.setAttribute('cy', Y(0));
      refs.ball.setAttribute('r', ended ? 0 : BALL_R);
      refs.shotLine.setAttribute('visibility', 'hidden');
      return;
    }
    const x = shot.x, y = shot.k * shot.x;
    const lineVisible = !(shot.phase === 'done' && !shot.hit);
    refs.shotLine.setAttribute('visibility', lineVisible ? 'visible' : 'hidden');
    refs.shotLine.setAttribute('x2', X(x));
    refs.shotLine.setAttribute('y2', Y(y));
    refs.ball.setAttribute('cx', X(x));
    refs.ball.setAttribute('cy', Y(y));
    refs.ball.setAttribute('r', ended && !shot.hit ? 0 : shot.r);
    refs.ball.classList.toggle('stopped', shot.phase === 'done' && !shot.hit);
  }

  function shoot(k, hit, onDone) {
    cancelAnimationFrame(raf);
    shot = { k, x: 0, xEnd: hit ? stage.x : edgeX(k), hit, phase: 'roll', r: BALL_R };
    render();
    let last = performance.now();
    let inStart = 0;
    const step = now => {
      const dt = Math.min(0.2, (now - last) / 1000);
      last = now;
      if (shot.phase === 'roll') {
        const pxPerUnit = Math.hypot(geo.sx, shot.k * geo.sy);
        shot.x = Math.min(shot.xEnd, shot.x + (SPEED * dt) / pxPerUnit);
        if (shot.x >= shot.xEnd) {
          if (shot.hit) {
            shot.phase = 'in';
            inStart = now;
            refs.cup.classList.add('cupin');
            refs.flag.classList.add('wave');
          } else {
            shot.phase = 'done';
            updateShot();
            setTimeout(() => { misses.push(shot.k); render(); onDone(); }, 350);
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
      stage = s; misses = []; shot = null; ended = null;
      render();
    },
    shoot,
    // 使える広さ（SVG に使える幅・高さ）から、正方形の方眼がいちばん大きく入る SVG の大きさを返す
    fit(availW, availH) {
      const u = Math.max(4, Math.min((availW - M.L - M.R) / RANGE.xMax, (availH - M.T - M.B) / RANGE.yMax));
      return sizeFor(u);
    },
    end(showLine) { ended = { showLine }; render(); },
    render,
  };
})();
