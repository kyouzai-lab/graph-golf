// 画面の切りかえと、1面の流れ。
(() => {
  const $ = id => document.getElementById(id);
  const screens = { title: $('title'), play: $('play'), final: $('final') };

  let kind = 'prop';  // 'prop' 比例 / 'inv' 反比例
  let random = false; // ランダムコースか
  let list = [];      // このコースのホール
  let runStars = [];  // ランダムコースで、この回にとった★
  let idx = 0;        // いまの面（0から）
  let used = 0;       // 打った回数
  let input = '';     // □ に入れている数（文字のまま）
  let busy = false;   // ボールが転がっている間は押せない
  let over = false;   // この面は終わった

  const fmt = n => String(Math.round(n * 1000) / 1000);
  const starText = n => '★'.repeat(n) + '☆'.repeat(3 - n);
  const course = () => COURSES[kind];

  function show(name) {
    for (const k in screens) screens[k].hidden = k !== name;
    if (name === 'play') { fitCourse(); Graph.render(); }
  }

  // コースの枠を、正方形の方眼（x 10目もり × y 20目もり）がいちばん大きく入る大きさにする。
  // 入力の側には最低 panelMin px を残す。
  const FRAME = 28;   // 木の枠（8px×2）＋内側のすき間（6px×2）
  function fitCourse() {
    const play = screens.play;
    if (play.hidden) return;
    const cs = getComputedStyle(play);
    const W = play.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const H = play.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const gap = parseFloat(cs.columnGap) || 0;
    const panelMin = W < 900 ? 300 : 360;
    const size = Graph.fit(W - gap - panelMin - FRAME, H - FRAME);
    const c = play.querySelector('.course');
    c.style.width = `${Math.floor(size.w + FRAME)}px`;
    c.style.height = `${Math.floor(size.h + FRAME)}px`;
  }
  // 画面の大きさ・向きが変わったら合わせ直す（resize が来ない場合もあるので見張る）
  new ResizeObserver(fitCourse).observe(screens.play);
  window.addEventListener('resize', fitCourse);
  window.addEventListener('orientationchange', () => setTimeout(fitCourse, 300));

  // ---------- タイトル ----------
  function showTitle() {
    document.querySelectorAll('.kind').forEach(b => {
      const on = b.dataset.kind === kind;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on);
    });
    document.body.dataset.kind = kind;
    const r = Store.reached(kind);
    $('contNote').textContent = r >= HOLES ? '★の ごうけいを 見る' : `ホール ${r + 1} から`;
    const best = Store.randomBest(kind);
    $('rndNote').textContent = best > 0 ? `いちばん ★${best}` : '毎回 ちがう ホール';
    const t = Store.total(kind);
    $('recordLine').textContent = t > 0 ? `${course().name}コース　いちばん よい ★の ごうけい ${t} / ${HOLES * 3}` : '';
    show('title');
  }

  document.querySelectorAll('.kind').forEach(b => b.addEventListener('click', () => {
    kind = b.dataset.kind;
    showTitle();
  }));
  $('btnNew').addEventListener('click', () => { Store.restart(kind); startCourse(false, 0); });
  $('btnCont').addEventListener('click', () => {
    if (Store.reached(kind) >= HOLES) { random = false; list = course().stages; showFinal(); }
    else startCourse(false, Store.reached(kind));
  });
  $('btnRandom').addEventListener('click', () => startCourse(true, 0));

  // きろくをけす（確認してから）
  $('btnErase').addEventListener('click', () => { $('dialog').hidden = false; });
  $('dlgNo').addEventListener('click', () => { $('dialog').hidden = true; });
  $('dlgYes').addEventListener('click', () => {
    Store.clear();
    $('dialog').hidden = true;
    showTitle();
  });

  function startCourse(isRandom, from) {
    random = isRandom;
    list = random ? randomStages(kind) : course().stages;
    runStars = list.map(() => 0);
    $('op').textContent = course().op;
    startStage(from);
  }

  // ---------- 1面 ----------
  function startStage(i) {
    idx = i; used = 0; input = ''; busy = false; over = false;
    $('holeNo').textContent = `${random ? 'ランダム' : 'ホール'} ${i + 1} / ${HOLES}`;
    $('pad').hidden = false;
    $('hint').hidden = false;
    $('result').hidden = true;
    $('panel').classList.remove('done');
    setHint(i === 0 ? 'カップの 目もりを 読んで、□に 数を 入れよう' : '□に 数を 入れて「うつ！」');
    updateTop();
    updateBox();
    show('play');
    Graph.setStage({ ...list[i], kind });
  }

  function headerStars() {
    return random ? runStars.reduce((a, b) => a + b, 0) : Store.total(kind);
  }

  function updateTop() {
    $('totalStars').textContent = `★ ${headerStars()}`;
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

  function setHint(text, cls) {
    const h = $('hint');
    h.textContent = text;
    h.classList.remove('warn', 'tip');
    if (cls) { void h.offsetWidth; h.classList.add(cls); }
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
      setHint('数を 入れてね', 'warn');
      return;
    }
    const st = list[idx];
    const hit = Math.abs(v - answerOf(kind, st)) <= EPS;
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
      if (used === TRIES - 1) {
        // 2打目を外したら手がかりを光らせる
        Graph.showHint();
        setHint(kind === 'prop'
          ? 'ヒント：カップへの線は、x＝1 のとき y は いくつ？'
          : 'ヒント：光った 長方形の ます目は いくつ？', 'tip');
      } else {
        setHint('はずれ！ うすい線を ヒントに もう一回');
      }
    });
  }

  function finish(stars) {
    over = true;
    const before = random ? 0 : Store.bestStars(kind, idx);
    if (random) runStars[idx] = stars;
    else Store.finishStage(kind, idx, stars);
    Graph.end(stars === 0);
    updateTop();

    const st = list[idx];
    const ans = fmt(answerOf(kind, st));
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
    const calc = kind === 'prop' ? `${st.y} ÷ ${st.x} ＝ <b>${ans}</b>` : `${st.x} × ${st.y} ＝ <b>${ans}</b>`;
    $('rCalc').innerHTML =
      `<p>カップは <b>(${st.x}, ${st.y})</b></p>` +
      `<p class="calc">${calc}</p>` +
      `<p>y ＝ ${ans} ${course().op} x</p>`;
    $('rBest').textContent = before > stars ? `これまでの いちばん：${starText(before)}` : '';
    $('btnNext').textContent = idx + 1 < HOLES ? 'つぎへ' : 'けっかを 見る';
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
    if (idx + 1 < HOLES) startStage(idx + 1);
    else showFinal();
  });
  $('btnBack').addEventListener('click', () => { if (!busy) showTitle(); });

  // ---------- 10面のあと ----------
  function showFinal() {
    const d = new Date();
    $('fDate').textContent = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    $('fTitle').textContent = `${random ? 'ランダム' : ''}${course().name}コース おわり！`;
    let total, starsOf;
    if (random) {
      total = runStars.reduce((a, b) => a + b, 0);
      const before = Store.finishRandom(kind, total);
      starsOf = i => runStars[i];
      $('fBest').textContent = total > before ? 'いちばん よい きろく！' : `いちばん よい ★の ごうけい ${before}`;
    } else {
      total = Store.total(kind);
      starsOf = i => Store.bestStars(kind, i);
      $('fBest').textContent = '';
    }
    $('fTotal').innerHTML = `★ ${total} <small>/ ${HOLES * 3}</small>`;
    const ol = $('fList');
    ol.textContent = '';
    list.forEach((_, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${random ? 'ランダム' : 'ホール'}${i + 1}</span><span class="s">${starText(starsOf(i))}</span>`;
      ol.appendChild(li);
    });
    $('btnAgain').hidden = !random;
    show('final');
  }
  $('btnFinalTitle').addEventListener('click', showTitle);
  $('btnAgain').addEventListener('click', () => startCourse(true, 0));

  // ---------- はじめ ----------
  Store.load();
  Graph.init($('graph'));
  showTitle();
})();
