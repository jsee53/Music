(() => {
  'use strict';

  // ---------- 장르 메타 ----------
  const GENRES = [
    { name: '발라드', color: '#ff5fa2', emoji: '🌙' },
    { name: '밴드·록', color: '#ff7a3c', emoji: '🎸' },
    { name: '댄스·K-POP', color: '#a66bff', emoji: '🪩' },
    { name: '인디·어쿠스틱', color: '#3fd49a', emoji: '🍃' },
    { name: 'R&B·힙합', color: '#4c8dff', emoji: '🎧' },
    { name: 'OST·서브컬처', color: '#38d6ff', emoji: '🎬' },
    { name: '해외 팝', color: '#ffc23c', emoji: '🌎' },
    { name: '트로트', color: '#ff4f4f', emoji: '🎺' },
  ];
  const GENRE = Object.fromEntries(GENRES.map(g => [g.name, g]));
  const genreOf = name => GENRE[name] || { name, color: '#9d8fb8', emoji: '🎵' };

  // ---------- 한글 유틸 ----------
  const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  const CHO_BASE = { 'ㄲ': 'ㄱ', 'ㄸ': 'ㄷ', 'ㅃ': 'ㅂ', 'ㅆ': 'ㅅ', 'ㅉ': 'ㅈ' };
  const isSyl = c => c >= '가' && c <= '힣';
  const isCho = c => CHO.includes(c);
  const choOf = c => isSyl(c) ? CHO[Math.floor((c.charCodeAt(0) - 0xac00) / 588)] : c;
  const cls = c => (isSyl(c) || isCho(c)) ? 0 : /[a-z]/i.test(c) ? 1 : 2;
  const collator = new Intl.Collator('ko', { sensitivity: 'base', numeric: true });
  const cmpName = (a, b) => (cls(a[0]) - cls(b[0])) || collator.compare(a, b);
  const sectionOf = s => {
    const c = s[0];
    if (isSyl(c)) { const k = choOf(c); return CHO_BASE[k] || k; }
    if (/[a-z]/i.test(c)) return c.toUpperCase();
    return '#';
  };

  // 검색용 인덱스: 공백/기호 제거 + 원문 위치 매핑 + 초성
  const STRIP = /[\s\-'’.,&()!?·:]/;
  function indexText(s) {
    let n = '', c = '', map = [];
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (STRIP.test(ch)) continue;
      n += ch.toLowerCase(); c += choOf(ch); map.push(i);
    }
    return { n, c, map };
  }
  const normQuery = q => [...q].filter(ch => !STRIP.test(ch)).join('').toLowerCase();
  function findIn(ix, q) {
    const L = q.length;
    outer: for (let i = 0; i + L <= ix.n.length; i++) {
      for (let j = 0; j < L; j++) {
        const qc = q[j];
        if (ix.n[i + j] !== qc && !(isCho(qc) && ix.c[i + j] === qc)) continue outer;
      }
      return [ix.map[i], ix.map[i + L - 1] + 1];
    }
    return null;
  }

  // ---------- 저장소 ----------
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } },
  };
  const CFG = window.KONO_CONFIG || {};
  const sb = CFG.supabaseUrl && CFG.supabaseAnonKey && window.supabase
    ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey)
    : null;
  let user = null;
  let live = false; // 서버(또는 서버에서 받은 캐시) 데이터인지

  // ---------- 데이터 ----------
  const splitArtists = a => a.split(/\s*(?:&|,)\s*/).filter(Boolean);
  const plain = s => ({ id: s.id, t: s.t, a: s.a, g: s.g, art: s.art || null, al: s.al || null, y: s.y || null, sung: s.sung, fav: s.fav, last: s.last });
  const fromRow = r => ({ id: r.id, t: r.title, a: r.artist, g: r.genre, art: r.art, al: r.album, y: r.year, sung: r.sung, fav: r.fav, last: r.last_song });
  const COL = { t: 'title', a: 'artist', g: 'genre', art: 'art', al: 'album', y: 'year', sung: 'sung', fav: 'fav', last: 'last_song' };
  function toRow(fields) {
    const row = {};
    for (const k in fields) if (COL[k]) row[COL[k]] = fields[k] === undefined ? null : fields[k];
    if (fields.sung === true) row.sung_at = new Date().toISOString();
    return row;
  }
  const enrich = s => Object.assign(s, { names: splitArtists(s.a), ixT: indexText(s.t), ixA: indexText(s.a) });
  const keyOf = (t, a) => normQuery(t) + '|' + normQuery(a);

  let SONGS = [], BY_ID = new Map(), ARTISTS = new Map();
  function setData(list) {
    SONGS = list.map(s => enrich(plain(s)));
    reindex();
  }
  function reindex() {
    SONGS.sort((x, y) => cmpName(x.t, y.t) || cmpName(x.a, y.a));
    BY_ID = new Map(SONGS.map(s => [String(s.id), s]));
    ARTISTS = new Map();
    for (const s of SONGS) if (s.sung) for (const n of s.names) {
      if (!ARTISTS.has(n)) ARTISTS.set(n, { name: n, songs: [], ix: indexText(n) });
      ARTISTS.get(n).songs.push(s);
    }
    for (const ar of ARTISTS.values()) {
      const withArt = ar.songs.filter(s => s.art).sort((x, y) => (y.y || 0) - (x.y || 0));
      ar.art = withArt[0] && withArt[0].art;
      const cnt = {};
      ar.songs.forEach(s => cnt[s.g] = (cnt[s.g] || 0) + 1);
      ar.genre = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0];
    }
  }
  const sung = () => SONGS.filter(s => s.sung);
  const saveCache = () => { if (live) LS.set('kono.cache', SONGS.map(plain)); };

  // ---------- 상태 ----------
  const state = { tab: 'all', drill: null, q: '', artistSort: LS.get('kono.artistSort2', 'count') };

  // ---------- DOM ----------
  const $ = s => document.querySelector(s);
  const main = $('#main'), qInput = $('#q'), clearBtn = $('#clearQ'), indexBar = $('#indexBar');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const size = (url, px) => url && url.replace(/\d+x\d+bb/, `${px}x${px}bb`);

  function hue(str) { let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 360; }
  function ph(seed, letter) {
    const h = hue(seed);
    return `<div class="ph" style="background:linear-gradient(135deg,hsl(${h} 75% 55%),hsl(${(h + 50) % 360} 70% 30%))">${esc(letter)}</div>`;
  }
  function art(url, px, seed, letter, eager) {
    if (!url) return ph(seed, letter);
    return `<img src="${esc(size(url, px))}" alt="" crossorigin="anonymous" decoding="async"${eager ? '' : ' loading="lazy"'} data-seed="${esc(seed)}" data-letter="${esc(letter)}">`;
  }
  document.addEventListener('error', e => {
    const img = e.target;
    if (img.tagName === 'IMG' && img.dataset.seed) img.outerHTML = ph(img.dataset.seed, img.dataset.letter);
  }, true);

  function hl(text, range) {
    if (!range) return esc(text);
    return esc(text.slice(0, range[0])) + '<mark>' + esc(text.slice(range[0], range[1])) + '</mark>' + esc(text.slice(range[1]));
  }

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.hidden = true, 2600);
  }

  function ask(title, msg, ok = '확인') {
    const dlg = $('#dialog');
    $('#dlgTitle').textContent = title;
    $('#dlgMsg').textContent = msg;
    $('#dlgOk').textContent = ok;
    dlg.hidden = false;
    return new Promise(resolve => {
      const done = v => { dlg.hidden = true; dlg.onclick = null; resolve(v); };
      dlg.onclick = e => {
        const b = e.target.closest('[data-dlg]');
        if (b) done(b.dataset.dlg === '1');
        else if (e.target === dlg) done(false);
      };
    });
  }

  // ---------- 행 ----------
  function row(s, m) {
    const g = genreOf(s.g);
    return `<li class="row${s.sung ? '' : ' unsung'}">
      <button class="hit" data-song="${s.id}">
        <div class="thumb">${art(s.art, 120, s.a, s.t[0])}</div>
        <div class="meta">
          <div class="t">${hl(s.t, m && m.t)}${s.last ? '<span class="flag" title="막곡">🏁</span>' : ''}</div>
          <div class="a">${hl(s.a, m && m.a)}<span class="chip" style="--c:${g.color}">${esc(s.g)}</span>${s.sung ? '' : '<span class="chip todo">안 불러봄</span>'}</div>
        </div>
      </button>
      ${s.sung ? '' : `<button class="sang" data-sang="${s.id}">불렀어요</button>`}
      <button class="star${s.fav ? ' on' : ''}" data-fav="${s.id}" aria-label="찜">${s.fav ? '★' : '☆'}</button>
    </li>`;
  }
  const list = (songs, ms) => `<ul class="list">${songs.map(s => row(s, ms && ms.get(s))).join('')}</ul>`;

  function sectioned(songs) {
    const groups = new Map();
    for (const s of songs) {
      const k = sectionOf(s.t);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(s);
    }
    let html = '';
    for (const [k, arr] of groups) html += `<h2 class="sec-h" data-sec="${esc(k)}">${esc(k)}<small>${arr.length}</small></h2>${list(arr)}`;
    return { html, keys: [...groups.keys()] };
  }

  // ---------- 뷰 ----------
  function viewAll() {
    const songs = sung();
    if (!songs.length) return `<div class="empty"><span class="big">🎤</span>아직 저장된 노래가 없어요.</div>`;
    const { html, keys } = sectioned(songs);
    setIndex(keys);
    return html;
  }

  function artistCard(ar) {
    return `<button class="artist" data-artist="${esc(ar.name)}">
      <div class="av">${art(ar.art, 300, ar.name, ar.name[0])}<span class="cnt">${ar.songs.length}</span></div>
      <div class="n">${esc(ar.name)}</div><div class="c">${esc(ar.genre)}</div></button>`;
  }

  function viewArtists() {
    const arr = [...ARTISTS.values()];
    if (state.artistSort === 'count') arr.sort((a, b) => b.songs.length - a.songs.length || cmpName(a.name, b.name));
    else arr.sort((a, b) => cmpName(a.name, b.name));
    return `<div class="toolbar"><span>가수 ${arr.length}명</span>
      <div class="seg"><button data-asort="count" class="${state.artistSort === 'count' ? 'on' : ''}">많이 부른 순</button><button data-asort="name" class="${state.artistSort === 'name' ? 'on' : ''}">가나다순</button></div></div>
      <div class="artists">${arr.map(artistCard).join('')}</div>`;
  }

  function viewGenres() {
    const all = sung();
    return `<div class="genres">${GENRES.map(g => {
      const songs = all.filter(s => s.g === g.name);
      if (!songs.length) return '';
      const covers = songs.filter(s => s.art).sort(() => Math.random() - .5).slice(0, 3);
      return `<button class="genre" data-genre="${esc(g.name)}" style="--c:${g.color}">
        <div class="gn">${esc(g.name)}</div><div class="gc">${songs.length}곡</div>
        <div class="covers">${covers.map(s => `<div>${art(s.art, 120, s.a, s.t[0])}</div>`).join('')}</div>
        <span class="em">${g.emoji}</span></button>`;
    }).join('')}</div>`;
  }

  // 찜 / 막곡: 안 불러본 노래(도전 예정)와 불러본 노래를 나눠서
  function viewPicked(flag) {
    const songs = SONGS.filter(s => s[flag]);
    const isFav = flag === 'fav';
    if (!songs.length) return `<div class="empty"><span class="big">${isFav ? '☆' : '🏁'}</span>${isFav
      ? '아직 찜한 노래가 없어요.<br>별을 누르거나 ＋ 로 부르고 싶은 노래를 추가해 보세요.'
      : '막곡 후보가 없어요.<br>노래를 눌러 <b>🏁 막곡</b> 버튼으로 담거나 ＋ 로 추가해 보세요.'}
      <br><button class="mini" data-add="${flag}" style="margin-top:14px">＋ 노래 추가</button></div>`;
    const todo = songs.filter(s => !s.sung), done = songs.filter(s => s.sung);
    let html = `<div class="toolbar"><span>${isFav ? '찜한 노래' : '막곡 후보'} ${songs.length}곡</span>
      <button class="mini" data-add="${flag}">＋ 추가</button></div>`;
    if (todo.length) html += `<h2 class="sec-h">🎯 아직 안 불러봄<small>${todo.length}</small></h2>${list(todo)}`;
    if (done.length) html += `<h2 class="sec-h">🎤 불러봤어요<small>${done.length}</small></h2>${list(done)}`;
    return html;
  }

  function hero({ title, sub, cover, round, bg, pickLabel }) {
    return `<section class="hero">
      <div class="hero-bg" style="${bg}"></div>
      <button class="back" data-back>‹ 뒤로</button>
      <div class="cover${round ? ' round' : ''}">${cover}</div>
      <div><h2>${esc(title)}</h2><p>${esc(sub)}</p><button class="pick" data-dice>🎲 ${esc(pickLabel)}</button></div>
    </section>`;
  }

  function drillSongs(d) {
    if (d.type === 'artist') { const ar = ARTISTS.get(d.key); return ar ? ar.songs : []; }
    return sung().filter(s => s.g === d.key);
  }

  function viewDrill() {
    const d = state.drill;
    if (d.type === 'artist') {
      const ar = ARTISTS.get(d.key);
      if (!ar) return `<div class="empty"><button class="back" data-back style="position:static;margin:0 auto 16px">‹ 뒤로</button>${esc(d.key)}의 노래가 없어요.</div>`;
      return hero({
        title: ar.name, sub: `${ar.songs.length}곡 · ${ar.genre}`, round: true,
        cover: art(ar.art, 300, ar.name, ar.name[0], true),
        bg: ar.art ? `background-image:url('${esc(size(ar.art, 200))}')` : `background:hsl(${hue(ar.name)} 70% 45%)`,
        pickLabel: '이 가수 노래 뽑기',
      }) + list(ar.songs);
    }
    const g = genreOf(d.key), songs = drillSongs(d);
    return hero({
      title: g.name, sub: `${songs.length}곡`, cover: `<div class="ph" style="background:linear-gradient(135deg,${g.color},#1a0f30);font-size:52px">${g.emoji}</div>`,
      bg: `background:${g.color}`, pickLabel: '이 장르에서 뽑기',
    }) + list(songs);
  }

  function search(q) {
    const nq = normQuery(q);
    if (!nq) return null;
    const ms = new Map(), hits = [];
    for (const s of SONGS) {
      const t = findIn(s.ixT, nq), a = findIn(s.ixA, nq);
      if (t || a) { ms.set(s, { t, a }); hits.push(s); }
    }
    const rank = s => { const m = ms.get(s); return m.t ? (m.t[0] === 0 ? 0 : 1) : 2; };
    hits.sort((x, y) => (y.sung - x.sung) || rank(x) - rank(y) || cmpName(x.t, y.t));
    const artists = [...ARTISTS.values()].filter(ar => findIn(ar.ix, nq)).slice(0, 12);
    return { hits, ms, artists };
  }

  function viewSearch() {
    const r = search(state.q);
    if (!r || !r.hits.length) return `<div class="empty"><span class="big">🔍</span>“${esc(state.q)}”에 해당하는 노래가 없어요.<br>
      <button class="mini" data-add="search" style="margin-top:14px">＋ “${esc(state.q)}” 추가하기</button></div>`;
    let html = '';
    if (r.artists.length) html += `<h2 class="sec-h">가수<small>${r.artists.length}</small></h2>
      <div class="artists">${r.artists.map(artistCard).join('')}</div>`;
    html += `<h2 class="sec-h">노래<small>${r.hits.length}</small></h2>` + list(r.hits, r.ms);
    return html;
  }

  // ---------- 렌더 ----------
  function render() {
    setIndex(null);
    let html;
    if (state.drill) html = viewDrill();
    else if (state.q) html = viewSearch();
    else html = { all: viewAll, artist: viewArtists, genre: viewGenres, fav: () => viewPicked('fav'), last: () => viewPicked('last') }[state.tab]();
    main.innerHTML = `<div class="view">${html}</div>`;
    document.querySelectorAll('.tabs button').forEach((b, i) => {
      const on = b.dataset.tab === state.tab;
      b.classList.toggle('on', on);
      if (on) $('.tab-ink').style.transform = `translateX(${i * 100}%)`;
    });
    paintCounts();
  }
  function paintCounts() {
    $('#totalCount').textContent = sung().length;
    const f = SONGS.filter(s => s.fav).length, l = SONGS.filter(s => s.last).length;
    const fc = $('#favCount'), lc = $('#lastCount');
    fc.hidden = !f; fc.textContent = f;
    lc.hidden = !l; lc.textContent = l;
  }

  function measureHeader() {
    document.documentElement.style.setProperty('--hdr', $('.top').offsetHeight + 'px');
  }

  // ---------- 인덱스 바 ----------
  let pop;
  function setIndex(keys) {
    if (!keys || keys.length < 2) { indexBar.hidden = true; indexBar.innerHTML = ''; return; }
    indexBar.hidden = false;
    indexBar.innerHTML = keys.map(k => `<span data-k="${esc(k)}">${esc(k)}</span>`).join('');
  }
  function jump(x, y) {
    const el = document.elementFromPoint(x, y);
    const k = el && el.dataset && el.dataset.k;
    if (!k) return;
    const sec = main.querySelector(`[data-sec="${CSS.escape(k)}"]`);
    if (!sec) return;
    window.scrollTo({ top: sec.offsetTop - $('.top').offsetHeight + 2 });
    if (!pop) { pop = document.createElement('div'); pop.className = 'index-pop'; document.body.appendChild(pop); }
    pop.textContent = k; pop.hidden = false;
  }
  const endJump = () => { indexBar.classList.remove('active'); if (pop) setTimeout(() => pop.hidden = true, 350); };
  indexBar.addEventListener('pointerdown', e => {
    indexBar.classList.add('active'); indexBar.setPointerCapture(e.pointerId); jump(e.clientX, e.clientY);
  });
  indexBar.addEventListener('pointermove', e => { if (indexBar.classList.contains('active')) jump(e.clientX, e.clientY); });
  indexBar.addEventListener('pointerup', endJump);
  indexBar.addEventListener('pointercancel', endJump);

  // ---------- 히스토리 (안드로이드 뒤로가기 대응) ----------
  const sheet = $('#sheet');
  let sheetOpen = false;
  const snapshot = () => ({ tab: state.tab, drill: state.drill, y: window.scrollY });
  function openDrill(d) {
    history.replaceState(snapshot(), '');
    state.drill = d;
    history.pushState(snapshot(), '');
    render(); window.scrollTo(0, 0);
  }
  window.addEventListener('popstate', e => {
    if (sheetOpen) { closeSheet(true); return; }
    const st = e.state || {};
    state.tab = st.tab || 'all'; state.drill = st.drill || null;
    render();
    requestAnimationFrame(() => window.scrollTo(0, st.y || 0));
  });

  // ---------- 시트 공통 ----------
  let sheetMode = null; // 'song' | 'form' | 'login'
  function showSheet(html, bgStyle, mode) {
    sheetMode = mode;
    $('#sheetBody').innerHTML = html;
    $('#sheetBody').className = 'sheet-body ' + mode;
    $('#sheetBg').style.cssText = bgStyle || 'display:none';
    if (!sheetOpen) {
      sheetOpen = true; sheet.hidden = false; sheet.classList.remove('closing');
      document.body.style.overflow = 'hidden';
      history.pushState({ ...snapshot(), sheet: true }, '');
    }
    $('.sheet-card').scrollTop = 0;
  }
  function closeSheet(fromPop) {
    if (!sheetOpen) return;
    sheetOpen = false; sheetMode = null;
    sheet.classList.add('closing');
    setTimeout(() => { sheet.hidden = true; sheet.classList.remove('closing'); }, 200);
    document.body.style.overflow = '';
    if (!fromPop) history.back();
  }

  // ---------- 노래 상세 ----------
  let curSong = null, curRandom = false;
  function songHTML(s, random) {
    const g = genreOf(s.g);
    const yt = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(`${s.t} ${s.a} 노래방`);
    const melon = 'https://www.melon.com/search/total/index.htm?q=' + encodeURIComponent(`${s.a} ${s.t}`);
    return `<div class="big-art">${art(s.art, 600, s.a, s.t[0], true)}</div>
      <h3>${esc(s.t)}</h3>
      <div class="who">${s.names.map(n => `<button data-artist="${esc(n)}">${esc(n)}</button>`).join(' & ')}</div>
      ${s.al ? `<div class="alb">${esc(s.al)}${s.y ? ' · ' + esc(s.y) : ''}</div>` : ''}
      <span class="chip" style="--c:${g.color}">${g.emoji} ${esc(s.g)}</span>${s.sung ? '' : '<span class="chip todo">아직 안 불러봄</span>'}
      <div class="acts">
        ${s.sung ? '' : `<button class="act wide sang-big" data-sang="${s.id}">🎤 불렀어요! 전체 노래에 저장</button>`}
        <button class="act fav${s.fav ? ' on' : ''}" data-fav="${s.id}">${s.fav ? '★ 찜했어요' : '☆ 찜하기'}</button>
        <button class="act lastb${s.last ? ' on' : ''}" data-last="${s.id}">${s.last ? '🏁 막곡 ✓' : '🏁 막곡 담기'}</button>
        <a class="act yt" href="${yt}" target="_blank" rel="noopener">▶ 노래방 영상</a>
        <a class="act" href="${melon}" target="_blank" rel="noopener">🎵 멜론</a>
        ${random ? `<button class="act wide" data-reroll>🎲 다시 뽑기</button>` : ''}
      </div>
      <button class="edit-link" data-edit="${s.id}">✏️ 정보 수정</button>`;
  }
  function paintSong(s, random) {
    curSong = s; curRandom = random;
    showSheet(songHTML(s, random), s.art ? `background-image:url('${size(s.art, 200)}')` : `background:hsl(${hue(s.a)} 70% 40%)`, 'song');
  }
  function repaintSheetIfSong(s) {
    if (sheetOpen && sheetMode === 'song' && curSong && curSong.id === s.id) {
      $('#sheetBody').innerHTML = songHTML(s, curRandom);
    }
  }

  // ---------- 랜덤 ----------
  function currentPool() {
    if (state.drill) return drillSongs(state.drill);
    if (state.q) { const r = search(state.q); if (r && r.hits.length) return r.hits; }
    if (state.tab === 'fav') { const p = SONGS.filter(s => s.fav); if (p.length) return p; }
    if (state.tab === 'last') { const p = SONGS.filter(s => s.last); if (p.length) return p; }
    return sung();
  }
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  let rolling = false;
  function roll() {
    const pool = currentPool();
    if (rolling || !pool.length) return;
    rolling = true;
    const dice = $('#dice'); dice.classList.remove('roll'); void dice.offsetWidth; dice.classList.add('roll');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const steps = reduce || pool.length < 2 ? 0 : 9;
    let n = 0;
    paintSong(pick(pool), true);
    const card = $('.sheet-card');
    const tick = () => {
      if (n++ >= steps) { rolling = false; card.classList.remove('shuffle'); return; }
      card.classList.remove('shuffle'); void card.offsetWidth; card.classList.add('shuffle');
      const s = pick(pool);
      curSong = s;
      $('#sheetBody').innerHTML = songHTML(s, true);
      $('#sheetBg').style.cssText = s.art ? `background-image:url('${size(s.art, 200)}')` : `background:hsl(${hue(s.a)} 70% 40%)`;
      setTimeout(tick, 60 + n * n * 4);
    };
    tick();
  }

  // ---------- 편집 권한 / 서버 쓰기 ----------
  function canEdit() {
    if (!sb) { toast('Supabase 연결 전이라 저장할 수 없어요 (config.js 설정 필요)'); return false; }
    if (!user) { openLogin('로그인하면 저장할 수 있어요'); return false; }
    if (!live) { toast('서버 목록을 아직 못 불러왔어요. 인터넷 연결을 확인해 주세요'); return false; }
    return true;
  }
  const errMsg = e => (e && e.message) ? e.message : '알 수 없는 오류';

  function afterChange(structural) {
    reindex(); saveCache();
    if (structural || state.tab === 'fav' || state.tab === 'last' || state.q) render();
    else paintCounts();
  }

  async function patch(s, fields) {
    const prev = {};
    for (const k in fields) prev[k] = s[k];
    Object.assign(s, fields);
    if ('t' in fields || 'a' in fields) enrich(s);
    paintFlags(s); afterChange('sung' in fields || 't' in fields || 'a' in fields || 'g' in fields || 'art' in fields);
    repaintSheetIfSong(s);
    const { error } = await sb.from('songs').update(toRow(fields)).eq('id', s.id);
    if (error) {
      Object.assign(s, prev); enrich(s);
      paintFlags(s); afterChange(true); repaintSheetIfSong(s);
      toast('저장 실패: ' + errMsg(error));
      return false;
    }
    return true;
  }

  async function removeSong(s) {
    const { error } = await sb.from('songs').delete().eq('id', s.id);
    if (error) { toast('삭제 실패: ' + errMsg(error)); return false; }
    SONGS = SONGS.filter(x => x !== s);
    afterChange(true);
    return true;
  }

  // 목록의 별/막곡 버튼 즉시 갱신 (전체 리렌더 없이)
  function paintFlags(s) {
    document.querySelectorAll(`[data-fav="${s.id}"]`).forEach(b => {
      b.classList.toggle('on', s.fav);
      b.textContent = b.classList.contains('act') ? (s.fav ? '★ 찜했어요' : '☆ 찜하기') : (s.fav ? '★' : '☆');
    });
    document.querySelectorAll(`[data-last="${s.id}"]`).forEach(b => {
      b.classList.toggle('on', s.last);
      b.textContent = s.last ? '🏁 막곡 ✓' : '🏁 막곡 담기';
    });
  }

  async function toggleFlag(s, flag) {
    if (!canEdit()) return;
    const next = !s[flag];
    const other = flag === 'fav' ? s.last : s.fav;
    if (!next && !s.sung && !other) {
      const ok = await ask('목록에서 지울까요?', `‘${s.t}’는 아직 안 불러본 노래라서, ${flag === 'fav' ? '찜' : '막곡'}에서 빼면 앱에서 사라져요.`, '지우기');
      if (!ok) return;
      if (await removeSong(s)) { if (sheetOpen && curSong === s) closeSheet(); toast('지웠어요'); }
      return;
    }
    if (await patch(s, { [flag]: next })) toast(next ? (flag === 'fav' ? '찜했어요 ★' : '막곡에 담았어요 🏁') : (flag === 'fav' ? '찜 해제' : '막곡에서 뺐어요'));
  }

  async function markSung(s) {
    if (!canEdit()) return;
    const ok = await ask('전체 노래에 저장할까요?', `‘${s.t} - ${s.a}’ 불러봤으면 전체 목록에 추가할게요. 찜·막곡 표시는 그대로 남아요.`, '저장');
    if (!ok) return;
    if (await patch(s, { sung: true })) toast('🎉 전체 노래에 저장했어요');
  }

  // ---------- 추가 / 수정 폼 ----------
  let form = null; // { mode, song, art, al, y, results, genreTouched }
  function formHTML() {
    const s = form.song || {};
    const edit = form.mode === 'edit';
    const g = form.g || s.g || '발라드';
    return `<form id="songForm" autocomplete="off">
      <h3 class="form-h">${edit ? '노래 정보 수정' : '노래 추가'}</h3>
      <label class="fld"><span>제목</span><input name="t" required value="${esc(form.t ?? s.t ?? '')}" placeholder="예) 사건의지평선"></label>
      <label class="fld"><span>가수</span><input name="a" required list="artistList" value="${esc(form.a ?? s.a ?? '')}" placeholder="예) 윤하 (여럿이면 &로)"></label>
      <datalist id="artistList">${[...ARTISTS.keys()].map(n => `<option value="${esc(n)}">`).join('')}</datalist>
      <div class="fld"><span>장르</span><div class="gpick">${GENRES.map(x => `<label style="--c:${x.color}"><input type="radio" name="g" value="${esc(x.name)}"${x.name === g ? ' checked' : ''}><i>${x.emoji} ${esc(x.name)}</i></label>`).join('')}</div></div>
      <div class="fld"><span>앨범 사진</span>
        <div class="artpick">
          <div class="art-prev">${form.art ? `<img src="${esc(size(form.art, 200))}" alt="" crossorigin="anonymous">` : ph((form.a ?? s.a ?? '?') || '?', (form.t ?? s.t ?? '?')[0] || '?')}</div>
          <div class="art-info">${form.art ? `<b>${esc(form.al || '선택한 사진')}</b>${form.y ? `<small>${esc(form.y)}</small>` : ''}<button type="button" class="link" data-noart>사진 빼기</button>` : '<small>사진 없으면 색 커버로 보여요</small>'}
            <button type="button" class="mini" data-findart>🔍 사진 찾기</button></div>
        </div>
        <div class="art-results" id="artResults">${artResultsHTML()}</div>
      </div>
      ${edit ? '' : `<div class="fld"><span>어디에 저장할까요?</span><div class="dest">
        <label><input type="checkbox" name="sung"${form.dest.sung ? ' checked' : ''}><i>🎤 불러봤어요<small>전체 노래</small></i></label>
        <label><input type="checkbox" name="fav"${form.dest.fav ? ' checked' : ''}><i>☆ 찜</i></label>
        <label><input type="checkbox" name="last"${form.dest.last ? ' checked' : ''}><i>🏁 막곡</i></label>
      </div><p class="hint">안 불러본 노래는 찜·막곡에만 담아두고, 부른 뒤에 “불렀어요”를 누르면 전체에 저장돼요.</p></div>`}
      <button class="act wide submit" type="submit">${edit ? '저장' : '추가하기'}</button>
      ${edit ? `<button type="button" class="danger" data-del="${s.id}">이 노래 삭제</button>` : ''}
    </form>`;
  }
  function artResultsHTML() {
    if (form.loading) return '<p class="hint">찾는 중…</p>';
    if (!form.results) return '';
    if (!form.results.length) return '<p class="hint">못 찾았어요. 제목이나 가수를 바꿔서 다시 찾아보세요.</p>';
    return form.results.map((r, i) => `<button type="button" class="ares${size(r.artworkUrl100, 600) === form.art ? ' on' : ''}" data-pickart="${i}">
      <img src="${esc(r.artworkUrl100)}" alt="" loading="lazy"><b>${esc(r.trackName)}</b><small>${esc(r.artistName)}</small></button>`).join('');
  }
  function readForm() {
    const f = $('#songForm');
    if (!f) return;
    form.t = f.t.value; form.a = f.a.value;
    const g = f.querySelector('input[name="g"]:checked'); if (g) form.g = g.value;
    if (f.sung) form.dest = { sung: f.sung.checked, fav: f.fav.checked, last: f.last.checked };
  }
  function paintForm() { readForm(); $('#sheetBody').innerHTML = formHTML(); }

  function openForm(mode, song, ctx) {
    if (!canEdit()) return;
    form = { mode, song, art: song ? song.art : null, al: song ? song.al : null, y: song ? song.y : null, results: null, genreTouched: mode === 'edit' };
    if (mode === 'add') {
      form.dest = { sung: !(ctx === 'fav' || ctx === 'last'), fav: ctx === 'fav', last: ctx === 'last' };
      if (ctx === 'search') form.t = state.q;
    }
    if (sheetOpen && sheetMode === 'song') {
      sheetMode = 'form'; $('#sheetBody').className = 'sheet-body form'; $('#sheetBg').style.cssText = 'display:none';
      $('#sheetBody').innerHTML = formHTML(); $('.sheet-card').scrollTop = 0;
    } else showSheet(formHTML(), '', 'form');
  }

  async function findArt() {
    readForm();
    const q = `${form.a || ''} ${form.t || ''}`.trim();
    if (!q) { toast('제목이나 가수를 먼저 입력해 주세요'); return; }
    form.loading = true; $('#artResults').innerHTML = artResultsHTML();
    try {
      const url = 'https://itunes.apple.com/search?' + new URLSearchParams({ term: q, country: 'US', entity: 'song', limit: '12', lang: 'ko_kr' });
      const res = await fetch(url);
      form.results = (await res.json()).results || [];
    } catch { form.results = []; toast('사진 검색 실패 (인터넷 연결 확인)'); }
    form.loading = false;
    if ($('#artResults')) $('#artResults').innerHTML = artResultsHTML();
  }

  async function submitForm() {
    readForm();
    const t = (form.t || '').trim(), a = (form.a || '').trim(), g = form.g || '발라드';
    if (!t || !a) { toast('제목과 가수를 입력해 주세요'); return; }
    const dup = SONGS.find(x => keyOf(x.t, x.a) === keyOf(t, a) && x !== form.song);
    if (dup) {
      if (await ask('이미 있는 노래예요', `‘${dup.t} - ${dup.a}’가 이미 있어요. 열어볼까요?`, '열기')) paintSong(dup, false);
      return;
    }
    const fields = { t, a, g, art: form.art || null, al: form.art ? form.al || null : null, y: form.art ? form.y || null : null };
    const btn = $('#songForm .submit'); btn.disabled = true;
    if (form.mode === 'edit') {
      const s = form.song;
      if (await patch(s, fields)) { toast('수정했어요'); paintSong(s, false); }
      else btn.disabled = false;
      return;
    }
    const d = form.dest;
    if (!d.sung && !d.fav && !d.last) { toast('저장할 곳을 하나 이상 골라주세요'); btn.disabled = false; return; }
    const { data, error } = await sb.from('songs').insert(toRow({ ...fields, sung: d.sung, fav: d.fav, last: d.last })).select().single();
    if (error) { toast('추가 실패: ' + errMsg(error)); btn.disabled = false; return; }
    const s = enrich(fromRow(data));
    SONGS.push(s); afterChange(true);
    toast(d.sung ? '🎉 전체 노래에 추가했어요' : (d.fav ? '찜에 담았어요' : '막곡에 담았어요'));
    paintSong(s, false);
  }

  // ---------- 로그인 ----------
  function loginHTML(msg) {
    if (user) return `<div class="login"><div class="big-ic">🎤</div><h3>로그인됨</h3><p class="hint">${esc(user.email)}</p>
      <p class="hint">노래 추가·찜·막곡이 서버에 저장돼서 폰을 바꿔도 그대로예요.</p>
      <button class="act wide" type="button" data-logout>로그아웃</button></div>`;
    if (!sb) return `<div class="login"><div class="big-ic">🔌</div><h3>서버 연결 전</h3>
      <p class="hint">config.js 에 Supabase URL과 키를 넣으면 로그인·저장 기능이 켜져요. 지금은 보기 전용이에요.</p></div>`;
    return `<form id="loginForm" class="login" autocomplete="on"><div class="big-ic">🔐</div><h3>로그인</h3>
      ${msg ? `<p class="hint">${esc(msg)}</p>` : ''}
      <label class="fld"><span>이메일</span><input name="email" type="email" required autocomplete="username"></label>
      <label class="fld"><span>비밀번호</span><input name="pw" type="password" required autocomplete="current-password"></label>
      <button class="act wide submit" type="submit">로그인</button></form>`;
  }
  function openLogin(msg) { showSheet(loginHTML(msg), '', 'login'); }
  function paintAccount() { $('#acctBtn .dot').hidden = !user; }

  // ---------- 이벤트 ----------
  document.addEventListener('click', e => {
    const t = e.target.closest('button, [data-close]');
    if (!t || t.closest('#dialog')) return;
    const d = t.dataset;
    if (d.tab) {
      state.drill = null;
      state.tab = d.tab;
      if (state.q) { state.q = ''; qInput.value = ''; clearBtn.hidden = true; }
      history.replaceState(snapshot(), '');
      render(); window.scrollTo(0, 0);
    }
    else if (d.fav) toggleFlag(BY_ID.get(d.fav), 'fav');
    else if (d.last) toggleFlag(BY_ID.get(d.last), 'last');
    else if (d.sang) markSung(BY_ID.get(d.sang));
    else if (d.song) paintSong(BY_ID.get(d.song), false);
    else if (d.artist) {
      const dr = { type: 'artist', key: d.artist };
      if (sheetOpen) { closeSheet(); setTimeout(() => openDrill(dr), 60); } else openDrill(dr);
    }
    else if (d.genre) openDrill({ type: 'genre', key: d.genre });
    else if (d.asort) { state.artistSort = d.asort; LS.set('kono.artistSort2', state.artistSort); render(); }
    else if ('back' in d) history.back();
    else if ('dice' in d || t.id === 'dice') roll();
    else if ('reroll' in d) roll();
    else if (d.add) openForm('add', null, d.add);
    else if (t.id === 'addBtn') openForm('add', null, state.tab);
    else if (t.id === 'acctBtn') openLogin();
    else if (d.edit) openForm('edit', BY_ID.get(d.edit));
    else if ('findart' in d) findArt();
    else if (d.pickart) {
      readForm();
      const r = form.results[+d.pickart];
      form.art = size(r.artworkUrl100, 600); form.al = r.collectionName || null; form.y = (r.releaseDate || '').slice(0, 4) || null;
      paintForm();
    }
    else if ('noart' in d) { readForm(); form.art = form.al = form.y = null; paintForm(); }
    else if (d.del) {
      const s = BY_ID.get(d.del);
      ask('정말 삭제할까요?', `‘${s.t} - ${s.a}’를 완전히 지워요. 되돌릴 수 없어요.`, '삭제').then(async ok => {
        if (ok && await removeSong(s)) { closeSheet(); toast('삭제했어요'); }
      });
    }
    else if ('logout' in d) sb.auth.signOut().then(() => { toast('로그아웃했어요'); closeSheet(); });
    else if ('close' in d) closeSheet();
  });

  document.addEventListener('submit', async e => {
    e.preventDefault();
    if (e.target.id === 'songForm') submitForm();
    else if (e.target.id === 'loginForm') {
      const f = e.target, btn = f.querySelector('.submit');
      btn.disabled = true;
      const { error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.pw.value });
      btn.disabled = false;
      if (error) toast('로그인 실패: 이메일/비밀번호를 확인해 주세요');
      else { toast('로그인했어요 👋'); closeSheet(); }
    }
  });

  // 가수 입력하면 그 가수의 주 장르를 자동 선택
  document.addEventListener('input', e => {
    if (!form || e.target.name === undefined) return;
    if (e.target.name === 'g') form.genreTouched = true;
    if (e.target.name === 'a' && !form.genreTouched) {
      const ar = ARTISTS.get(e.target.value.trim());
      if (ar) { const r = document.querySelector(`#songForm input[name="g"][value="${CSS.escape(ar.genre)}"]`); if (r) r.checked = true; }
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!$('#dialog').hidden) $('#dialog [data-dlg="0"]').click();
    else if (sheetOpen) closeSheet();
  });

  let qTimer;
  qInput.addEventListener('input', () => {
    clearTimeout(qTimer);
    clearBtn.hidden = !qInput.value;
    qTimer = setTimeout(() => {
      const had = !!state.q;
      state.q = qInput.value.trim();
      if (state.q && state.drill) { state.drill = null; history.replaceState(snapshot(), ''); }
      render();
      if (!had || !state.q) window.scrollTo(0, 0);
    }, 120);
  });
  qInput.addEventListener('keydown', e => { if (e.key === 'Enter') qInput.blur(); });
  clearBtn.addEventListener('click', () => { qInput.value = ''; clearBtn.hidden = true; state.q = ''; render(); qInput.focus(); });

  // ---------- 설치 안내 ----------
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const inst = $('#install');
  let deferred;
  if (!standalone && !LS.get('kono.installDismissed', false)) {
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault(); deferred = e;
      $('#installBtn').hidden = false; inst.hidden = false;
    });
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) setTimeout(() => {
      $('#installText').innerHTML = '공유 버튼 → <b>홈 화면에 추가</b>하면 앱처럼 쓸 수 있어요';
      inst.hidden = false;
    }, 1500);
  }
  $('#installBtn').addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt(); await deferred.userChoice; deferred = null; inst.hidden = true;
  });
  $('#installClose').addEventListener('click', () => { inst.hidden = true; LS.set('kono.installDismissed', true); });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
  }

  // ---------- 서버 동기화 ----------
  async function refresh() {
    const all = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from('songs').select('*').order('id').range(from, from + 999);
      if (error) {
        if (!live) toast('오프라인 — 저장된 목록을 보여줘요');
        return;
      }
      all.push(...data);
      if (data.length < 1000) break;
    }
    live = true;
    setData(all.map(fromRow));
    saveCache();
    if (!sheetOpen || sheetMode !== 'form') render();
  }

  // ---------- 시작 ----------
  const cached = sb ? LS.get('kono.cache', null) : null;
  if (cached && cached.length) { setData(cached); live = true; }
  else setData((window.SONGS || []).map((s, i) => ({ id: 's' + i, ...s, sung: true, fav: false, last: false })));

  history.replaceState(snapshot(), '');
  measureHeader();
  window.addEventListener('resize', measureHeader);
  render();

  if (sb) {
    sb.auth.getSession().then(({ data }) => { user = data.session ? data.session.user : null; paintAccount(); });
    sb.auth.onAuthStateChange((_e, session) => { user = session ? session.user : null; paintAccount(); });
    refresh();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
  }
})();
