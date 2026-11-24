// 画面の切りかえと、1面の流れ。
(() => {
  const $ = id => document.getElementById(id);
  const screens = { title: $('title'), play: $('play'), final: $('final') };

  let idx = 0;        // いまの面（0から）
  let used = 0;       // 打った回数
  let input = '';     // □ に入れている数（文字のまま）
  let busy = false;   // ボールが転がっている間は押せない
  let over = false;   // この面は終わった

  const fmt = n => String(Math.round(n * 1000) / 1000);
  const starText = n => '★'.repeat(n) + '☆'.repeat(3 - n);

  function show(name) {
    for (const k in screens) screens[k].hidden = k !== name;
    if (name === 'play') Graph.render();
  }

  // ---------- タイトル ----------
  function showTitle() {
    const r = Store.reached;
    $('contNote').textContent = r >= STAGES.length ? '★の ごうけいを 見る' : `ホール ${r + 1} から`;
    const t = Store.total();
    $('recordLine').textContent = t > 0 ? `いちばん よい ★の ごうけい　${t} / ${STAGES.length * 3}` : '';
    show('title');
  }

  $('btnNew').addEventListener('click', () => { Store.restart(); startStage(0); });
  $('btnCont').addEventListener('click', () => {
    if (Store.reached >= STAGES.length) showFinal();
    else startStage(Store.reached);
  });

  // きろくをけす（確認してから）
  $('btnErase').addEventListener('click', () => { $('dialog').hidden = false; });
  $('dlgNo').addEventListener('click', () => { $('dialog').hidden = true; });
  $('dlgYes').addEventListener('click', () => {
    Store.clear();
    $('dialog').hidden = true;
    showTitle();
  });

  // ---------- 1面 ----------
  function startStage(i) {
    idx = i; used = 0; input = ''; busy = false; over = false;
    $('holeNo').textContent = `ホール ${i + 1} / ${STAGES.length}`;
    $('pad').hidden = false;
    $('hint').hidden = false;
    $('result').hidden = true;
    $('panel').classList.remove('done');
    setHint(i === 0 ? 'カップの 目もりを 読んで、□に 数を 入れよう' : '□に 数を 入れて「うつ！」');
    updateTop();
    updateBox();
    show('play');
    Graph.setStage(STAGES[i]);
  }

  function updateTop() {
    $('totalStars').textContent = `★ ${Store.total()}`;
    const balls = $('balls');
    balls.textContent = '';
    for (let n = 0; n < TRIES; n++) {
      const s = document.createElement('span');
      if (n < used) s.className = 'used';
      balls.appendChild(s);
    }
  }

  function updateBox() {
    const b = $('box');
    b.textContent = input || ' ';
    b.classList.toggle('empty', !input);
  }

  function setHint(text, warn) {
    const h = $('hint');
    h.textContent = text;
    h.classList.remove('warn');
    if (warn) { void h.offsetWidth; h.classList.add('warn'); }
  }

  function press(k) {
    if (busy || over) return;
    if (k === 'go') return submit();
    if (k === 'del') input = input.slice(0, -1);
    else if (k === '.') {
      if (input.includes('.') || input.length >= 4) return;
      input = input ? input + '.' : '0.';
    } else {
      if (input.length >= 4) return;
      input = input === '0' ? k : input + k;
    }
    updateBox();
  }

  function submit() {
    const v = parseFloat(input);
    if (!(v > 0)) {                 // 空・0 のときは回数を減らさない
      setHint('数を 入れてね', true);
      return;
    }
    const st = STAGES[idx];
    const hit = Math.abs(v - st.y / st.x) <= EPS;
    used++;
    busy = true;
    updateTop();
    setHint('コロコロ…');
    $('panel').classList.add('rolling');
    Graph.shoot(v, hit, () => {
      busy = false;
      $('panel').classList.remove('rolling');
      if (hit) return finish(TRIES + 1 - used);
      if (used >= TRIES) return finish(0);
      input = '';
      updateBox();
      setHint('はずれ！ うすい線を ヒントに もう一回');
    });
  }

  function finish(stars) {
    over = true;
    const before = Store.bestStars(idx);
    Store.finishStage(idx, stars);
    Graph.end(stars === 0);
    updateTop();

    const st = STAGES[idx];
    const ans = fmt(st.y / st.x);
    if (stars === 0) { input = ans; updateBox(); }
    $('rTitle').textContent = stars > 0 ? (used === 1 ? 'ホールインワン！' : 'カップイン！') : 'ざんねん…';
    const rs = $('rStars');
    rs.innerHTML = '';
    for (let n = 0; n < 3; n++) {
      const s = document.createElement('span');
      s.textContent = n < stars ? '★' : '☆';
      if (n < stars) { s.className = 'on'; s.style.animationDelay = `${0.15 + n * 0.25}s`; }
      rs.appendChild(s);
    }
    $('rCalc').innerHTML =
      `<p>カップは <b>(${st.x}, ${st.y})</b></p>` +
      `<p class="calc">${st.y} ÷ ${st.x} ＝ <b>${ans}</b></p>` +
      `<p>y ＝ ${ans} × x</p>`;
    $('rBest').textContent = before > stars ? `これまでの いちばん：${starText(before)}` : '';
    $('btnNext').textContent = idx + 1 < STAGES.length ? 'つぎへ' : 'けっかを 見る';
    $('pad').hidden = true;
    $('hint').hidden = true;
    $('result').hidden = false;
    $('panel').classList.add('done');
  }

  $('pad').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b) press(b.dataset.k);
  });
  $('btnNext').addEventListener('click', () => {
    if (idx + 1 < STAGES.length) startStage(idx + 1);
    else showFinal();
  });
  $('btnBack').addEventListener('click', () => { if (!busy) showTitle(); });

  // ---------- 10面のあと ----------
  function showFinal() {
    $('fTotal').innerHTML = `★ ${Store.total()} <small>/ ${STAGES.length * 3}</small>`;
    const list = $('fList');
    list.textContent = '';
    STAGES.forEach((_, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<span>ホール${i + 1}</span><span class="s">${starText(Store.bestStars(i))}</span>`;
      list.appendChild(li);
    });
    show('final');
  }
  $('btnFinalTitle').addEventListener('click', showTitle);

  // ---------- はじめ ----------
  Store.load();
  Graph.init($('graph'));
  showTitle();
})();
