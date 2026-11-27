/* 터틀 모의투자 앱 — data.json(turtle.appdata 가 생성)을 읽어 그리기만 한다. 계산은 하지 않는다. */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const S = { data: null, market: localStorage.getItem('turtle.market') || 'KR', tab: 'home', date: null, mode: 'daily', stale: false };
  const TABS = [
    ['home', '홈', '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>'],
    ['holdings', '보유', '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'],
    ['orders', '주문·체결', '<path d="M7 4v16"/><path d="M3 8l4-4 4 4"/><path d="M17 20V4"/><path d="M13 16l4 4 4-4"/>'],
    ['journal', '일지', '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M9 9h6"/><path d="M9 13h6"/>'],
    ['feedback', '피드백', '<path d="M4 5h16v11H9l-5 4z"/><path d="M9 10l2 2 4-4"/>'],
  ];
  const icon = (paths, size = 22, sw = 2) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

  // ───── 표기 ─────
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v, d = 0) => Number(v).toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const isKRW = () => M().currency === 'KRW';
  const px = (v) => (v == null ? '-' : isKRW() ? num(Math.round(v)) : '$' + num(v, 2));
  const money = (v) => (isKRW() ? num(Math.round(Math.abs(v))) + '원' : '$' + num(Math.abs(v), 2));
  const signed = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + money(v);
  const arrow = (v) => (v > 0 ? '▲ ' : v < 0 ? '▼ ' : '') + money(v);
  const pct = (v, d = 2) => (v > 0 ? '+' : v < 0 ? '−' : '') + num(Math.abs(v), d) + '%';
  const cls = (v) => (v > 0.0000001 ? 'up' : v < -0.0000001 ? 'down' : 'flat');
  const md5 = (d) => (d ? d.slice(5) : '');
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
  const dlabel = (d) => { const t = new Date(d + 'T00:00:00'); return `${t.getMonth() + 1}월 ${t.getDate()}일 (${DOW[t.getDay()]})`; };
  const M = () => S.data.markets[S.market] || Object.values(S.data.markets)[0];
  // 일지·피드백·주간 리뷰 본문은 날짜별 파일(d/…)로 나뉘어 있어 열 때 받는다
  // 공개 호스팅에서는 장부가 암호화돼 있다 (meta.json 이 있으면 암호화 모드). 열쇠는 비밀번호에서 만들어 이 기기에만 저장한다.
  const ENC = { on: false, key: null, meta: null, checked: false };
  const KEY_STORE = 'turtle.key.v1';
  const b64d = (t) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
  const b64e = (u8) => btoa(String.fromCharCode(...u8));
  async function initCrypto() {
    if (ENC.checked) return;
    try { const r = await fetch('meta.json', { cache: 'no-store' }); if (r.ok) { ENC.meta = await r.json(); ENC.on = true; } } catch (e) { /* 평문 모드 */ }
    ENC.checked = true;
    if (ENC.on) { const k = localStorage.getItem(KEY_STORE); if (k) { try { ENC.key = await crypto.subtle.importKey('raw', b64d(k), 'AES-GCM', false, ['decrypt']); } catch (e) { localStorage.removeItem(KEY_STORE); } } }
  }
  async function keyFromPassword(pw) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: b64d(ENC.meta.salt), iterations: ENC.meta.iter }, base, 256);
    const raw = new Uint8Array(bits);
    return { raw, key: await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']) };
  }
  async function getJSON(path, key = ENC.key) {
    const r = await fetch(ENC.on ? path + '.enc' : path, { cache: 'no-store' });
    if (!r.ok) throw new Error('http ' + r.status);
    const stale = r.headers.get('x-from-cache') === '1';
    if (!ENC.on) return { json: await r.json(), stale };
    const buf = new Uint8Array(await r.arrayBuffer());
    let plain;
    try { plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, key, buf.slice(12)); } catch (e) { const err = new Error('badkey'); err.badKey = true; throw err; }
    return { json: JSON.parse(new TextDecoder().decode(plain)), stale };
  }
  function lock(msg) {
    ENC.key = null; localStorage.removeItem(KEY_STORE); S.data = null; DCACHE.clear();
    $('#tabs').innerHTML = '';
    $('#top').innerHTML = '<div class="top-row"><div><h1 class="title">터틀 모의투자</h1><div class="subtitle">비밀번호로 잠겨 있습니다</div></div></div>';
    $('#view').innerHTML = `<form class="card" id="unlock" autocomplete="on"><h2>비밀번호 입력</h2>
      <label class="label" for="pw">처음 한 번만 넣으면 이 기기에 기억됩니다</label>
      <input id="pw" name="password" type="password" autocomplete="current-password" required style="height:48px;border:1px solid var(--line);border-radius:12px;background:var(--bg);color:var(--ink);padding:0 14px;font:inherit;font-size:16px">
      <div class="small" id="pwmsg" role="alert" style="color:var(--bad-ink);min-height:18px">${esc(msg || '')}</div>
      <button class="btn" type="submit" style="background:var(--brand);color:var(--on-brand);border-color:var(--brand)">열기</button></form>`;
    const form = $('#unlock');
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); const btn = $('button', form); const out = $('#pwmsg'); btn.disabled = true; out.textContent = '확인하는 중입니다…'; out.style.color = 'var(--muted)';
      try {
        const k = await keyFromPassword($('#pw').value);
        await getJSON('data.json', k.key);
        ENC.key = k.key; localStorage.setItem(KEY_STORE, b64e(k.raw)); load();
      } catch (err) {
        btn.disabled = false; out.style.color = 'var(--bad-ink)';
        out.textContent = err.badKey ? '비밀번호가 맞지 않습니다.' : '장부를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.';
      }
    });
    $('#pw').focus();
  }
  const DCACHE = new Map();
  async function detail(path) {
    if (DCACHE.has(path)) return DCACHE.get(path);
    const { json } = await getJSON('d/' + path); DCACHE.set(path, json); return json;
  }
  const loadFail = '<div class="card"><div class="empty">이 날짜의 내용을 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.</div></div>';

  // ───── 간단 마크다운 ─────
  function inline(t) {
    let s = esc(t);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
    return s;
  }
  function cells(line) {
    return line.replace(/\\\|/g, '\u0000').trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim().replace(/\u0000/g, '|'));
  }
  function md(text) {
    if (!text) return '';
    const lines = String(text).replace(/\r/g, '').split('\n');
    const out = []; let i = 0; let para = [];
    const flush = () => { if (para.length) { out.push('<p>' + para.map(inline).join('<br>') + '</p>'); para = []; } };
    while (i < lines.length) {
      const L = lines[i]; const t = L.trim();
      if (t.startsWith('```')) {
        flush(); const lang = t.slice(3).trim(); const buf = []; i++;
        while (i < lines.length && !lines[i].trim().startsWith('```')) { buf.push(lines[i]); i++; }
        i++;
        if (lang === 'mermaid') out.push('<p class="muted small">(차트는 홈 화면에서 볼 수 있습니다)</p>');
        else out.push('<pre class="tbl"><code>' + esc(buf.join('\n')) + '</code></pre>');
        continue;
      }
      if (t.startsWith('|')) {
        flush(); const rows = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(cells(lines[i])); i++; }
        const isSep = (r) => r.every((c) => /^:?-{2,}:?$/.test(c) || c === '');
        let head = null; let body = rows;
        if (rows.length > 1 && isSep(rows[1])) { head = rows[0]; body = rows.slice(2); }
        out.push('<div class="tbl"><table>' + (head ? '<thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead>' : '')
          + '<tbody>' + body.filter((r) => !isSep(r)).map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>');
        continue;
      }
      if (/^#{1,6}\s/.test(t)) { flush(); const lv = t.match(/^#+/)[0].length; out.push(`<${lv <= 2 ? 'h3' : 'h4'}>${inline(t.replace(/^#+\s*/, ''))}</${lv <= 2 ? 'h3' : 'h4'}>`); i++; continue; }
      if (/^(-|\*|\d+\.)\s+/.test(t)) {
        flush(); const ordered = /^\d+\./.test(t); const items = [];
        while (i < lines.length && /^\s*(-|\*|\d+\.)\s+/.test(lines[i])) { items.push(lines[i].trim().replace(/^(-|\*|\d+\.)\s+/, '')); i++;
          while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*(-|\*|\d+\.)\s+/.test(lines[i])) { items[items.length - 1] += ' ' + lines[i].trim(); i++; } }
        out.push(`<${ordered ? 'ol' : 'ul'}>` + items.map((x) => `<li>${inline(x)}</li>`).join('') + `</${ordered ? 'ol' : 'ul'}>`);
        continue;
      }
      if (t.startsWith('>')) { flush(); const buf = []; while (i < lines.length && lines[i].trim().startsWith('>')) { buf.push(lines[i].trim().replace(/^>\s?/, '')); i++; } out.push('<blockquote>' + buf.map(inline).join('<br>') + '</blockquote>'); continue; }
      if (/^<\/?details>$/.test(t)) { flush(); out.push(t); i++; continue; }
      const sm = t.match(/^<details><summary>(.*)<\/summary>$/) || t.match(/^<summary>(.*)<\/summary>$/);
      if (sm) { flush(); out.push((t.startsWith('<details>') ? '<details>' : '') + '<summary>' + esc(sm[1]) + '</summary>'); i++; continue; }
      if (/^(---+|\*\*\*+)$/.test(t)) { flush(); i++; continue; }
      if (!t) { flush(); i++; continue; }
      para.push(t); i++;
    }
    flush();
    return '<div class="md">' + out.join('') + '</div>';
  }
  const mdInline = (t) => inline(String(t || '').replace(/\s+/g, ' '));

  // ───── 라우팅 ─────
  function parseHash() {
    const p = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    if (p[0] && TABS.some((t) => t[0] === p[0])) S.tab = p[0];
    if (p[0] === 'weekly') { S.tab = 'feedback'; S.mode = 'weekly'; S.date = p[1] || null; return; }
    if (p[1] && S.data && S.data.markets[p[1]]) S.market = p[1];
    S.date = p[2] || null;
    if (S.tab === 'feedback') S.mode = 'daily';
  }
  function go(tab, date, replace) {
    const h = S.tab === 'feedback' && S.mode === 'weekly' && tab === 'feedback' ? `#/weekly/${date || ''}` : `#/${tab}/${S.market}${date ? '/' + date : ''}`;
    if (replace) history.replaceState(null, '', h); else location.hash = h;
    if (replace) render();
  }

  // ───── 공통 조각 ─────
  function header(title, sub, extra = '') {
    const ms = Object.keys(S.data.markets);
    $('#top').innerHTML = `<div class="top-row"><div><h1 class="title">${esc(title)}</h1><div class="subtitle">${esc(sub)}</div></div>
      <div class="top-actions"><button class="icon-btn" id="help" aria-label="용어와 규칙 보기">${icon('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7"/><path d="M12 17h.01"/>', 20)}</button>
      <div class="seg" role="group" aria-label="시장 선택">${ms.map((m) => `<button type="button" data-market="${m}" aria-pressed="${m === S.market}">${m}</button>`).join('')}</div></div></div>${extra}`;
    $('#top').querySelectorAll('[data-market]').forEach((b) => b.addEventListener('click', () => {
      S.market = b.dataset.market; localStorage.setItem('turtle.market', S.market); S.date = null;
      if (S.mode === 'weekly' && S.tab === 'feedback') { render(); return; }
      go(S.tab, null, true);
    }));
    $('#help').addEventListener('click', openSheet);
  }
  function stepper(dates, cur, onPick, right = '') {
    const i = dates.indexOf(cur);
    return { html: `<div class="stepper"><div class="left">
        <button class="icon-btn" data-step="-1" ${i <= 0 ? 'disabled' : ''} aria-label="이전 날짜">${icon('<path d="M15 5l-7 7 7 7"/>', 18, 2.5)}</button>
        <select aria-label="날짜 선택">${dates.slice().reverse().map((d) => `<option value="${d}" ${d === cur ? 'selected' : ''}>${dlabel(d)}</option>`).join('')}</select>
        <button class="icon-btn" data-step="1" ${i >= dates.length - 1 ? 'disabled' : ''} aria-label="다음 날짜">${icon('<path d="M9 5l7 7-7 7"/>', 18, 2.5)}</button>
      </div>${right}</div>`,
      bind() {
        $('#top').querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => { const n = dates[i + Number(b.dataset.step)]; if (n) onPick(n); }));
        $('#top select').addEventListener('change', (e) => onPick(e.target.value));
      } };
  }
  const staleNote = () => (S.stale ? '<div class="stale">인터넷에 연결되지 않아 마지막으로 받은 장부를 보여 줍니다.</div>' : '');

  // ───── 차트 ─────
  function chart(curve, indexName) {
    const W = 340, H = 150, L = 4, R = 62, T = 10, B = 22; const pw = W - L - R, ph = H - T - B;
    const vals = curve.flatMap((c) => [c.e, c.b]).filter((v) => v != null);
    let lo = Math.min(...vals), hi = Math.max(...vals); const pad = Math.max(0.5, (hi - lo) * 0.12); lo -= pad; hi += pad;
    const x = (i) => L + (curve.length > 1 ? (pw * i) / (curve.length - 1) : pw / 2);
    const y = (v) => T + (ph * (hi - v)) / (hi - lo);
    const line = (k) => curve.map((c, i) => (c[k] == null ? null : `${x(i).toFixed(1)},${y(c[k]).toFixed(1)}`)).filter(Boolean).join(' ');
    const step = (hi - lo) > 12 ? 10 : (hi - lo) > 5 ? 5 : (hi - lo) > 2 ? 2 : 1;
    const grid = []; for (let g = Math.ceil(lo / step) * step; g <= hi; g += step) grid.push(g);
    const last = curve[curve.length - 1]; const hasB = last.b != null;
    let ye = y(last.e), yb = hasB ? y(last.b) : null;
    if (hasB && Math.abs(ye - yb) < 26) { const mid = (ye + yb) / 2; if (ye <= yb) { ye = mid - 13; yb = mid + 13; } else { ye = mid + 13; yb = mid - 13; } }
    const lx = W - R + 8;
    return `<div class="legend"><span><i style="background:var(--s1)"></i>내 자산</span>${hasB ? `<span><i style="background:var(--s2)"></i>${esc(indexName)}</span>` : ''}</div>
    <div class="chart" id="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(md5(curve[0].d))}을 100으로 놓은 꺾은선 차트. 내 자산 ${last.e}${hasB ? `, ${esc(indexName)} ${last.b}` : ''}">
      ${grid.map((g) => `<line x1="${L}" y1="${y(g).toFixed(1)}" x2="${W - R}" y2="${y(g).toFixed(1)}" stroke="var(--line)" stroke-width="1"/><text x="${L}" y="${(y(g) - 3).toFixed(1)}" font-size="10" fill="var(--muted)">${g}</text>`).join('')}
      ${hasB ? `<polyline fill="none" stroke="var(--s2)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${line('b')}"/>` : ''}
      <polyline fill="none" stroke="var(--s1)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${line('e')}"/>
      <line id="cx" x1="0" y1="${T}" x2="0" y2="${T + ph}" stroke="var(--muted)" stroke-width="1" stroke-dasharray="3 3" visibility="hidden"/>
      ${hasB ? `<circle id="cb" cx="${x(curve.length - 1)}" cy="${y(last.b)}" r="4" fill="var(--s2)" stroke="var(--card)" stroke-width="2"/>` : ''}
      <circle id="ce" cx="${x(curve.length - 1)}" cy="${y(last.e)}" r="4" fill="var(--s1)" stroke="var(--card)" stroke-width="2"/>
      <text x="${lx}" y="${(ye + 1).toFixed(1)}" font-size="11" font-weight="700" fill="var(--ink)">${last.e.toFixed(2)}</text><text x="${lx}" y="${(ye + 13).toFixed(1)}" font-size="10" fill="var(--muted)">내 자산</text>
      ${hasB ? `<text x="${lx}" y="${(yb + 1).toFixed(1)}" font-size="11" font-weight="700" fill="var(--ink)">${last.b.toFixed(2)}</text><text x="${lx}" y="${(yb + 13).toFixed(1)}" font-size="10" fill="var(--muted)">${esc(indexName)}</text>` : ''}
      <text x="${L}" y="${H - 5}" font-size="10" fill="var(--muted)">${md5(curve[0].d)}</text><text x="${W - R}" y="${H - 5}" font-size="10" fill="var(--muted)" text-anchor="end">${md5(last.d)}</text>
    </svg><div class="tip" id="tip" hidden></div></div>`;
  }
  function bindChart(curve, indexName) {
    const box = $('#chart'); if (!box) return; const svg = $('svg', box); const tip = $('#tip'); const cxl = $('#cx');
    const W = 340, L = 4, R = 62, pw = W - L - R;
    const move = (ev) => {
      const r = svg.getBoundingClientRect(); const sx = ((ev.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(curve.length - 1, Math.round(((sx - L) / pw) * (curve.length - 1)))); const c = curve[i];
      const X = L + (pw * i) / Math.max(1, curve.length - 1);
      cxl.setAttribute('x1', X); cxl.setAttribute('x2', X); cxl.setAttribute('visibility', 'visible');
      tip.hidden = false; tip.innerHTML = `<b>${md5(c.d)}</b><br>내 자산 ${c.e.toFixed(2)}${c.b != null ? `<br>${esc(indexName)} ${c.b.toFixed(2)}` : ''}`;
      const left = (X / W) * r.width; const tw = tip.offsetWidth; tip.style.left = Math.max(0, Math.min(r.width - tw, left - tw / 2)) + 'px';
    };
    const leave = () => { tip.hidden = true; cxl.setAttribute('visibility', 'hidden'); };
    box.addEventListener('pointermove', move); box.addEventListener('pointerdown', move); box.addEventListener('pointerleave', leave); box.addEventListener('pointercancel', leave);
  }

  // ───── 화면: 홈 ─────
  function viewHome() {
    const m = M(), s = m.summary;
    header('터틀 모의투자', `${dlabel(m.date)} 장 마감 기준`);
    const used = s.limit_risk ? Math.min(100, (s.open_risk / s.limit_risk) * 100) : 0;
    const gapLine = s.gap_pp == null ? '' : `<div class="note ${s.gap_pp >= 0 ? 'good' : 'warn'}">같은 기간 ${esc(m.index)}는 ${pct(s.bench_ret_pct)}, 내 자산은 ${pct(s.ret_pct)}. 지수보다 <b>${num(Math.abs(s.gap_pp), 2)}%p</b> ${s.gap_pp >= 0 ? (s.ret_pct < 0 ? '덜 빠졌습니다' : '앞서 있습니다') : '뒤처져 있습니다'}.</div>`;
    const cap = s.bottom_cap && s.bottom_cap.active ? `<div class="small muted">바닥형 ${s.bottom_cap.held} / ${s.bottom_cap.max} (${esc(s.bottom_cap.index)} 하락추세 중 상한)</div>` : '';
    return `${staleNote()}
    <section class="card"><div><div class="label">총 평가자산</div>
      <div class="big">${isKRW() ? num(Math.round(s.equity)) + '<span class="unit">원</span>' : '$' + num(s.equity, 2)}</div>
      <div class="strong ${cls(s.pnl)}" style="font-size:15px">${arrow(s.pnl)} (${pct(s.ret_pct)})</div>
      <div class="small muted">시작 자금 ${money(s.start)} 대비</div></div>
      <div class="grid3"><div class="tile"><span class="label">실현 손익</span><span class="v ${cls(s.realized)}">${signed(s.realized)}</span></div>
      <div class="tile"><span class="label">평가 손익</span><span class="v ${cls(s.unrealized)}">${signed(s.unrealized)}</span></div>
      <div class="tile"><span class="label">수수료</span><span class="v">${signed(s.fees)}</span></div></div></section>
    <section class="card"><div class="row"><h2>내 자산과 ${esc(m.index)}</h2><span class="small muted">${md5(m.curve[0].d)} = 100</span></div>
      ${chart(m.curve, m.index)}${gapLine}</section>
    <section class="card"><h2>오늘의 상태</h2><div class="grid2">
      <div class="kv"><span class="label">현금 비중</span><span class="v">${num(s.cash_pct, 0)}% <small>${money(s.cash)}</small></span></div>
      <div class="kv"><span class="label">보유 종목</span><span class="v">${s.n_positions} <small>/ 최대 ${s.max_positions}</small></span></div>
      <div class="kv"><span class="label">최대 낙폭 (MDD)</span><span class="v">${pct(s.mdd_pct)}</span></div>
      <div class="kv"><span class="label">지수 추세</span><span class="v">${esc(m.index)} ${esc(s.trend)}</span></div></div>
      <div><div class="row small muted"><span>리스크 사용 (한도 1%)</span><span style="color:var(--ink);font-weight:500">${px(s.open_risk)} / ${px(s.limit_risk)}</span></div>
      <div class="bar ${s.open_risk > s.limit_risk ? 'over' : ''}" style="margin:6px 0"><i style="width:${used.toFixed(0)}%"></i></div>
      <div class="small muted">${s.budget_risk > 0 ? `새로 살 수 있는 여유 ${money(s.budget_risk)}` : '리스크 한도가 차서 새로 살 수 없습니다'} · 오늘 결정: ${esc(s.decision)}</div>${cap}</div>
      <a class="btn" href="#/journal/${S.market}/${m.date}">오늘 일지 보기</a></section>`;
  }

  // ───── 화면: 보유 ─────
  function viewHoldings() {
    const m = M(), s = m.summary;
    header('보유 종목', `${dlabel(m.date)} 종가 기준 · ${m.positions.length}종목`);
    if (!m.positions.length) return staleNote() + '<div class="card"><div class="empty">보유 종목이 없습니다. 전부 현금입니다.</div></div>';
    const cards = m.positions.map((p) => `<section class="card">
      <div class="row top"><div><div class="pos-name">${esc(p.name)}</div>
        <div class="pos-meta">${esc(p.ticker.replace(/\.(KS|KQ)$/, ''))} · ${num(p.shares)}주 · ${p.bars}일째 <span class="chip ${p.kind === 'bottom' ? 'warn' : 'good'}">${p.kind === 'bottom' ? '바닥형' : '추세형'}</span></div></div>
        <div><div class="pos-pct ${cls(p.pnl_pct)}">${pct(p.pnl_pct)}</div><div class="pos-amt ${cls(p.pnl_amt)}">${arrow(p.pnl_amt)}</div></div></div>
      <div class="grid3"><div class="kv"><span class="label">최초 매수가</span><span style="font-size:14px;font-weight:500">${px(p.first_price)}</span></div>
        <div class="kv"><span class="label">현재가</span><span style="font-size:14px;font-weight:700">${px(p.close)}</span></div>
        <div class="kv"><span class="label">트레일링 스탑</span><span style="font-size:14px;font-weight:500">${px(p.stop)}</span></div></div>
      ${p.hint ? `<div class="note ${p.hint_tone || 'plain'}">${esc(p.hint)}</div>` : ''}
      <div class="small" style="color:var(--ink2)"><span class="muted">매수 이유</span> ${mdInline(p.reason)}</div>
      <details><summary>자세히</summary><div class="grid2" style="padding-top:4px">
        <div class="kv"><span class="label">평가금액</span><span class="v" style="font-size:14px">${money(p.value)}</span></div>
        <div class="kv"><span class="label">스탑까지 거리</span><span class="v" style="font-size:14px">${p.stop_gap_n == null ? '-' : num(p.stop_gap_n, 1) + 'N'}</span></div>
        <div class="kv"><span class="label">R (각오한 손실 대비)</span><span class="v ${cls(p.r || 0)}" style="font-size:14px">${p.r == null ? '-' : (p.r > 0 ? '+' : p.r < 0 ? '−' : '') + num(Math.abs(p.r), 2) + 'R'}</span></div>
        <div class="kv"><span class="label">보유 중 최고가</span><span class="v" style="font-size:14px">${px(p.peak)}</span></div>
        <div class="kv"><span class="label">처음 손절가</span><span class="v" style="font-size:14px">${px(p.initial_stop)}</span></div>
        <div class="kv"><span class="label">하루 평균 변동 (N)</span><span class="v" style="font-size:14px">${px(p.n)}</span></div></div>
        ${p.actions.length ? '<div style="padding-top:10px;display:flex;flex-direction:column;gap:6px">' + p.actions.map((a) => `<div class="small" style="color:var(--ink2)"><code style="font-size:11px">${esc(a.code)}</code> ${esc(a.text)}</div>`).join('') + '</div>' : ''}
      </details></section>`).join('');
    const cap = s.bottom_cap && s.bottom_cap.active ? `<section class="card" style="gap:4px"><div class="strong" style="font-size:13px">바닥형 ${s.bottom_cap.held} / ${s.bottom_cap.max}</div>
      <div class="small muted">${esc(s.bottom_cap.index)}가 하락추세라 바닥형은 ${s.bottom_cap.max}종목까지만 살 수 있습니다. 넘으면 주문이 거부됩니다.</div></section>` : '';
    return `${staleNote()}<section class="card"><div class="grid2">
      <div class="kv"><span class="label">주식 평가금액</span><span class="v" style="font-size:18px">${money(s.stock_value)}</span></div>
      <div class="kv"><span class="label">평가 손익</span><span class="v ${cls(s.unrealized)}" style="font-size:18px">${arrow(s.unrealized)}</span></div></div></section>${cards}${cap}`;
  }

  // ───── 화면: 주문·체결 ─────
  function viewOrders() {
    const m = M();
    header('주문·체결', `${dlabel(m.date)} 장 마감 기준`);
    const sideChip = (side) => `<span class="chip ${side === 'BUY' ? 'buy' : 'sell'}">${side === 'BUY' ? '매수' : '매도'}</span>`;
    const pend = m.pending.length ? m.pending.map((o) => `<section class="card" style="gap:10px"><div class="row"><div class="item" style="padding:0;border:0"><div class="l">${sideChip(o.side)}<span class="pos-name">${esc(o.name)}</span></div></div>
        <span style="font-size:14px;font-weight:500">${o.shares === 'all' ? '전량' : num(o.shares) + '주'}</span></div>
        ${o.engine ? `<div class="note plain"><b>엔진 자동 주문</b> · ${esc(o.reason_ko)}. ${esc(o.note.replace(/^엔진 시간 손절 — /, ''))}</div>` : `<div class="small" style="color:var(--ink2)">${o.kind ? `<span class="chip ${o.kind === 'bottom' ? 'warn' : 'good'}">${o.kind === 'bottom' ? '바닥형' : '추세형'}</span> ` : ''}${mdInline(o.note)}${o.stop ? ` · 스탑 ${px(o.stop)}` : ''}</div>`}</section>`).join('')
      : '<div class="card"><div class="small muted">대기 중인 주문이 없습니다.</div></div>';
    const fills = m.fills.slice(0, 8).map((f) => `<div class="item"><div class="l">${sideChip(f.side)}<div><div class="t">${esc(f.name)}</div><div class="small muted">${md5(f.date)} · ${num(f.shares)}주${f.reason_ko ? ' · ' + esc(f.reason_ko) : ''}</div></div></div><div class="r" style="font-size:14px;font-weight:500">${px(f.price)}</div></div>`).join('');
    const more = m.fills.length > 8 ? `<details style="padding:0 0 4px"><summary>이전 체결 ${m.fills.length - 8}건</summary>${m.fills.slice(8).map((f) => `<div class="item" style="display:flex;justify-content:space-between;padding:10px 0;border-top:1px solid var(--line)"><div class="l">${sideChip(f.side)}<div><div class="t">${esc(f.name)}</div><div class="small muted">${md5(f.date)} · ${num(f.shares)}주</div></div></div><div class="r" style="font-size:14px;font-weight:500">${px(f.price)}</div></div>`).join('')}</details>` : '';
    const closed = m.closed.map((t) => `<div class="item"><div><div class="t">${esc(t.name)}</div><div class="small muted">${md5(t.entry_date)} → ${md5(t.exit_date)} · ${esc(t.reason_ko)}</div></div>
      <div class="r"><div class="strong ${cls(t.ret_pct)}" style="font-size:14px">${pct(t.ret_pct)}</div><div class="small muted">${(t.r > 0 ? '+' : t.r < 0 ? '−' : '') + num(Math.abs(t.r), 2)}R · ${signed(t.pnl)}</div></div></div>`).join('');
    const realized = m.summary.realized_closed;
    return `${staleNote()}<div class="section-title"><span>대기 주문 ${m.pending.length}건${m.pending.length ? ' · 다음 장 시가에 체결' : ''}</span></div>${pend}
      <div class="section-title"><span>최근 체결</span></div>${m.fills.length ? `<div class="list">${fills}${more}</div>` : '<div class="card"><div class="small muted">체결 내역이 없습니다.</div></div>'}
      <div class="section-title"><span>끝난 거래 ${m.closed.length}건</span><span class="small muted" style="font-weight:400">실현 손익 <b class="${cls(realized)}">${signed(realized)}</b></span></div>
      ${m.closed.length ? `<div class="list">${closed}</div><div class="small muted" style="padding:0 4px">R은 살 때 각오한 손실을 1로 놓은 손익입니다. −1R은 계획한 만큼만 잃고 끝났다는 뜻입니다.</div>` : '<div class="card"><div class="small muted">아직 끝난 거래가 없습니다.</div></div>'}`;
  }

  // ───── 화면: 일지 ─────
  const verdictChip = (v) => { const t = String(v || ''); const k = /기각/.test(t) ? 'bad' : /지지/.test(t) && !/보류/.test(t) ? 'good' : /진행/.test(t) ? 'good' : 'warn'; return `<span class="chip ${k}">${mdInline(t.length > 16 ? t.slice(0, 15) + '…' : t)}</span>`; };
  async function viewJournal() {
    const m = M(); const dates = m.journals.map((j) => j.date);
    if (!dates.length) { header('매매 일지', '매매 AI가 장 마감 뒤 작성'); return '<div class="card"><div class="empty">아직 일지가 없습니다.</div></div>'; }
    const cur = dates.includes(S.date) ? S.date : dates[dates.length - 1];
    const st = stepper(dates, cur, (d) => go('journal', d));
    header('매매 일지', '매매 AI가 장 마감 뒤 작성', st.html); st.bind();
    let j; try { j = Object.assign({}, await detail(`${S.market}/j-${cur}.json`), m.journals[dates.indexOf(cur)]); } catch (e) { return loadFail; }
    const hyp = j.hypotheses.length ? j.hypotheses.map((h) => `<div class="sub"><div class="row"><span class="h">${esc(h.id)} · ${esc(h.start)} ~ ${esc(h.end)}</span>${verdictChip(h.verdict)}</div>
        <div class="b">${mdInline(h.text)}</div><div class="m">${mdInline(h.result)}</div></div>`).join('') : (j.hypotheses_md ? md(j.hypotheses_md) : '<div class="small muted">기록된 가설이 없습니다.</div>');
    const rs = j.resp_status;
    const respChip = rs.total ? `<span class="chip ${rs.missing.length ? 'bad' : 'good'}">${rs.ok} / ${rs.total} 응답${rs.missing.length ? ' · 미응답 ' + rs.missing.length : ''}</span>` : '';
    const resp = j.responses.length ? j.responses.map((r) => `<div class="sub"><div class="row"><span class="h" style="font-weight:500">${mdInline(String(r.instruction).replace(/^\[[^\]]+\]\s*/, '').slice(0, 60))}${String(r.instruction).length > 60 ? '…' : ''}</span>
        <span class="small strong" style="color:${/^이견/.test(r.answer) ? 'var(--warn-ink)' : 'var(--brand-ink)'}">${esc(r.answer)}</span></div><div class="m">${mdInline(r.why)}</div></div>`).join('')
      : (j.responses_md ? md(j.responses_md) : '<div class="small muted">응답할 지시가 없었습니다.</div>');
    const hasFb = m.feedback.some((f) => f.date === cur);
    return `${staleNote()}<section class="card"><div class="row"><h2>오늘의 결정</h2><span class="chip plain" style="font-size:13px;padding:3px 10px">${esc(j.badge.text)}</span></div>
        ${j.market_view ? md(j.market_view) : ''}${j.decision ? md(j.decision) : ''}</section>
      ${j.holdings_note ? `<section class="card" style="gap:0"><details><summary>보유 종목 코멘트</summary>${md(j.holdings_note)}</details></section>` : ''}
      <section class="card"><div class="row"><h2>가설 현황</h2></div>${hyp}</section>
      <section class="card"><div class="row"><h2>피드백 응답</h2>${respChip}</div>${resp}</section>
      ${hasFb ? `<a class="btn" href="#/feedback/${S.market}/${cur}">이 날의 피드백 보기</a>` : ''}
      <section class="card" style="gap:0"><details><summary>일지 전문</summary>${md(j.md)}</details></section>`;
  }

  // ───── 화면: 피드백 ─────
  const CHECK = { ok: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--brand-ink)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="준수"><path d="M5 12l5 5 9-10"/></svg>',
    warn: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--warn-ink)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="부분 준수"><path d="M12 4l9 16H3z"/><path d="M12 10v4"/><path d="M12 17h.01"/></svg>',
    bad: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--bad-ink)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="위반"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>',
    na: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="3" stroke-linecap="round" role="img" aria-label="해당 없음"><path d="M6 12h12"/></svg>' };
  function modeSeg() { return `<div class="seg small" role="group" aria-label="일일 또는 주간"><button type="button" data-mode="daily" aria-pressed="${S.mode === 'daily'}">일일</button><button type="button" data-mode="weekly" aria-pressed="${S.mode === 'weekly'}">주간</button></div>`; }
  function bindMode() { $('#top').querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { S.mode = b.dataset.mode; S.date = null; location.hash = S.mode === 'weekly' ? '#/weekly' : `#/feedback/${S.market}`; })); }
  async function viewFeedback() {
    if (S.mode === 'weekly') return viewWeekly();
    const m = M(); const dates = m.feedback.map((f) => f.date);
    if (!dates.length) { header('피드백', '피드백 AI의 평가', `<div class="stepper"><span></span>${modeSeg()}</div>`); bindMode(); return '<div class="card"><div class="empty">아직 피드백이 없습니다.</div></div>'; }
    const cur = dates.includes(S.date) ? S.date : dates[dates.length - 1];
    const st = stepper(dates, cur, (d) => go('feedback', d), modeSeg());
    header('피드백', `${dlabel(cur)} 매매에 대한 평가`, st.html); st.bind(); bindMode();
    let f; try { f = await detail(`${S.market}/f-${cur}.json`); } catch (e) { return loadFail; }
    if (f.format === 'prose') return `${staleNote()}<section class="card">${md(f.md)}</section>`;
    const okN = f.checklist.filter((c) => c.verdict === 'ok').length; const bad = f.checklist.some((c) => c.verdict === 'bad'); const warn = f.checklist.some((c) => c.verdict === 'warn');
    const checks = f.checklist.map((c) => `<div class="check">${CHECK[c.verdict] || CHECK.na}<div><div>${mdInline(c.rule)}</div>${c.verdict !== 'ok' && c.why ? `<div class="why">${mdInline(c.why)}</div>` : ''}</div></div>`).join('');
    const fixes = f.fixes.length ? f.fixes.map((x, i) => `<div class="numbered"><b>${i + 1}</b><div><div style="font-size:13px;font-weight:700">${mdInline(x.what)}</div><div class="small muted" style="margin-top:3px">${mdInline(x.numbers)}</div><div class="small" style="margin-top:3px;color:var(--ink2)"><span class="muted">다음부터</span> ${mdInline(x.next)}</div></div></div>`).join('') : (f.fixes_md ? md(f.fixes_md) : '<div class="small muted">지적 사항이 없습니다.</div>');
    const handled = f.handled.length ? `<section class="card"><h2>어제 지시 처리</h2>${f.handled.map((h) => `<div class="sub"><div class="row"><span class="h" style="font-weight:500">${esc(h.id)}</span><span class="small strong" style="color:${/미이행|부당|미응답/.test(h.verdict) ? 'var(--bad-ink)' : 'var(--brand-ink)'}">${mdInline(String(h.verdict).split('—')[0].trim())}</span></div><div class="m">${mdInline(String(h.instruction).slice(0, 110))}${String(h.instruction).length > 110 ? '…' : ''}</div></div>`).join('')}</section>` : '';
    const actions = f.actions.length ? f.actions.map((a) => `<div class="sub"><div class="row top"><span class="b" style="font-weight:500;color:var(--ink)">${mdInline(a.action.length > 90 ? a.action.slice(0, 89) + '…' : a.action)}</span><span class="small muted" style="white-space:nowrap">${esc(a.due)}까지</span></div>
        <div class="m">${esc(a.kind)} · ${esc(a.id)}${a.cond && !/조건 없음/.test(a.cond) ? ' · 조건: ' + mdInline(a.cond) : ''}</div></div>`).join('') : '<div class="small muted">내일 지시가 없습니다.</div>';
    return `${staleNote()}<section class="card"><div class="row"><h2>규칙 준수</h2><span class="chip ${bad ? 'bad' : warn ? 'warn' : 'good'}" style="font-size:13px;padding:3px 10px">${okN} / ${f.checklist.length} 준수</span></div>
        <div style="display:flex;flex-direction:column;gap:8px">${checks}</div></section>
      <section class="card"><h2>고칠 점 ${f.fixes.length ? f.fixes.length + '가지' : ''}</h2>${fixes}</section>
      ${handled}
      <section class="card"><div class="row"><h2>내일 할 일</h2><span class="small muted">매매 AI가 모두 답해야 함</span></div>${actions}</section>
      ${f.good ? `<section class="card"><h2>잘한 점</h2>${md(f.good)}</section>` : ''}
      ${f.watch ? `<section class="card"><h2>내일 지켜볼 것</h2>${md(f.watch)}</section>` : ''}
      <a class="btn" href="#/journal/${S.market}/${cur}">이 날의 일지 보기</a>
      <section class="card" style="gap:0"><details><summary>피드백 전문</summary>${md(f.md)}</details></section>`;
  }
  async function viewWeekly() {
    const ws = S.data.weekly; const dates = ws.map((w) => w.date);
    if (!dates.length) { header('주간 리뷰', '토요일마다 두 시장을 합쳐 작성', `<div class="stepper"><span></span>${modeSeg()}</div>`); bindMode(); return '<div class="card"><div class="empty">아직 주간 리뷰가 없습니다.</div></div>'; }
    const cur = dates.includes(S.date) ? S.date : dates[dates.length - 1];
    const st = stepper(dates, cur, (d) => { location.hash = `#/weekly/${d}`; }, modeSeg());
    header('주간 리뷰', 'KR과 US를 합친 한 주 정리', st.html); st.bind(); bindMode();
    let w; try { w = await detail(`weekly/${cur}.json`); } catch (e) { return loadFail; }
    return `${staleNote()}${w.conclusion ? `<section class="card"><h2>이번 주 결론</h2>${md(w.conclusion)}</section>` : ''}<section class="card" style="gap:0"><details open><summary>주간 리뷰 전문</summary>${md(w.md)}</details></section>`;
  }

  // ───── 용어·규칙 시트 ─────
  function openSheet() {
    const el = $('#sheet'); let which = 'glossary';
    const draw = () => { el.innerHTML = `<div class="sheet-body" role="dialog" aria-modal="true" aria-label="용어와 규칙"><div class="row"><div class="seg small" role="group"><button type="button" data-w="glossary" aria-pressed="${which === 'glossary'}">용어</button><button type="button" data-w="rules" aria-pressed="${which === 'rules'}">규칙</button></div>
        <button class="icon-btn" id="close" aria-label="닫기">${icon('<path d="M6 6l12 12"/><path d="M18 6L6 18"/>', 18, 2.5)}</button></div>
        <div class="sheet-scroll">${md(which === 'glossary' ? S.data.glossary_md : S.data.rules_md)}</div>
        ${ENC.on ? '<button class="btn" id="lockbtn" type="button">이 기기에서 잠그기 (비밀번호 다시 묻기)</button>' : ''}</div>`;
      if (ENC.on) $('#lockbtn').addEventListener('click', () => { close(); lock(''); });
      el.querySelectorAll('[data-w]').forEach((b) => b.addEventListener('click', () => { which = b.dataset.w; draw(); }));
      $('#close').addEventListener('click', close); $('#close').focus(); };
    const close = () => { el.hidden = true; el.innerHTML = ''; document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    el.hidden = false; draw(); el.onclick = (e) => { if (e.target === el) close(); }; document.addEventListener('keydown', onKey);
  }

  // ───── 그리기 ─────
  let renderSeq = 0;
  async function render() {
    if (!S.data) return;
    if (!S.data.markets[S.market]) S.market = Object.keys(S.data.markets)[0];
    const views = { home: viewHome, holdings: viewHoldings, orders: viewOrders, journal: viewJournal, feedback: viewFeedback };
    const seq = ++renderSeq;
    $('#tabs').innerHTML = '<div class="inner">' + TABS.map(([k, label, p]) => `<a href="#/${k}/${S.market}" ${k === S.tab ? 'aria-current="page"' : ''}>${icon(p)}${label}</a>`).join('') + '</div>';
    const html = await (views[S.tab] || viewHome)();
    if (seq !== renderSeq) return;      // 그 사이 다른 화면으로 넘어갔으면 버린다
    $('#view').innerHTML = html;
    if (S.tab === 'home') bindChart(M().curve, M().index);
    document.title = '터틀 모의투자 · ' + (TABS.find((t) => t[0] === S.tab) || TABS[0])[1];
  }
  window.addEventListener('hashchange', () => { const prev = S.tab + S.date + S.mode; parseHash(); render(); if (prev !== S.tab + S.date + S.mode) window.scrollTo(0, 0); });

  async function load() {
    await initCrypto();
    if (ENC.on && !ENC.key) { lock(''); return; }
    try {
      const { json: fresh, stale } = await getJSON('data.json');
      if (S.data && S.data.generated_at !== fresh.generated_at) DCACHE.clear();
      S.data = fresh; S.stale = stale;
    } catch (e) {
      if (e.badKey) { lock('비밀번호가 바뀌었습니다. 새 비밀번호를 넣어 주세요.'); return; }
      if (!S.data) $('#view').innerHTML = '<div class="card"><div class="empty">장부를 불러오지 못했습니다. 인터넷 연결을 확인하고 다시 열어 주세요.</div></div>';
      return;
    }
    parseHash(); render();
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.data) load(); });
  load();
})();
