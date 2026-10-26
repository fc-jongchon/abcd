const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => iso(new Date());
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const isColor = c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
const mk = (tag, props, ...kids) => {
  const el = Object.assign(document.createElement(tag), props);
  el.append(...kids);
  return el;
};
const svgIcon = (id, cls = 'ic') => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('class', cls);
  const u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  u.setAttribute('href', '#' + id);
  s.append(u);
  return s;
};

const DEFAULTS = { name: '', avatar: '📖', accent: '#4f7cf0', theme: 'light', goal: 120, focus: 25, brk: 5 };
const AVATARS = ['📖', '🦊', '🐱', '🐻', '🌱', '🚀', '⭐', '🎧'];
const PALETTE = ['#4f7cf0', '#f2705f', '#4cc38a', '#a779f0', '#f2994a', '#2d9cdb', '#e0559f', '#f2c94c'];
const QUOTES = [
  '꾸준함은 재능을 이깁니다. 오늘도 멋진 하루예요!',
  '천 리 길도 한 걸음부터. 지금의 한 걸음이 쌓여요.',
  '지금의 노력이 언젠가 분명히 빛날 거예요.',
  '어제보다 조금 더 나은 오늘이면 충분해요.',
  '작은 습관이 큰 변화를 만들어요.',
  '포기하지 않는 한, 실패는 없어요.',
  '오늘 할 수 있는 만큼만, 그러나 꾸준히.',
  '쉬는 것도 공부의 일부예요. 잘 쉬고 다시 시작해요.'
];
const OTHER = '기타';
const CAL_START = 8, CAL_END = 22, HOUR_PX = 28;
const VIEWS = ['dash', 'plan', 'cal', 'stats', 'set'];

let settings = { ...DEFAULTS, ...load('planner.settings', {}) };
let tasks = load('planner.tasks', []);
let log = load('planner.log', {});
let colors = load('planner.colors', {});
let exams = load('planner.exams', []);
let memo = load('planner.memo', '');
let filter = 'all', query = '', weekOffset = 0, view = 'dash';
let quoteIdx = Math.floor(Date.now() / 864e5) % QUOTES.length;

const legacy = load('planner.studied', null);
if (legacy && !Object.keys(log).length) {
  for (const [d, m] of Object.entries(legacy)) if (+m > 0) log[d] = { [OTHER]: +m };
  localStorage.removeItem('planner.studied');
}

const save = () => {
  localStorage.setItem('planner.settings', JSON.stringify(settings));
  localStorage.setItem('planner.tasks', JSON.stringify(tasks));
  localStorage.setItem('planner.log', JSON.stringify(log));
  localStorage.setItem('planner.colors', JSON.stringify(colors));
  localStorage.setItem('planner.exams', JSON.stringify(exams));
};

const dayTotal = d => Object.values(log[d] || {}).reduce((a, b) => a + b, 0);
const subjectColor = s => {
  if (!s || s === OTHER) return '#8b95a1';
  if (!isColor(colors[s])) colors[s] = PALETTE[Object.keys(colors).length % PALETTE.length];
  return colors[s];
};
const knownSubjects = () => [...new Set(tasks.map(x => x.subject).filter(Boolean))];
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fmtTime = m => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
const fmtDur = m => (m >= 60 && m % 60 === 0 ? `${m / 60}h` : m > 60 ? `${Math.floor(m / 60)}h${m % 60}m` : `${m}m`);
const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);
const daysUntil = ds => { const n = new Date(); n.setHours(0, 0, 0, 0); return Math.round((new Date(ds + 'T00:00:00') - n) / 864e5); };
const ddLabel = n => (n === 0 ? 'D-Day' : n > 0 ? `D-${n}` : `D+${-n}`);

function streaks() {
  const d = new Date();
  if (!dayTotal(iso(d))) d.setDate(d.getDate() - 1);
  let cur = 0;
  while (dayTotal(iso(d)) > 0) { cur++; d.setDate(d.getDate() - 1); }
  let best = 0, run = 0, prev = null;
  for (const k of Object.keys(log).filter(k => dayTotal(k) > 0).sort()) {
    run = prev && Math.round((new Date(k) - new Date(prev)) / 864e5) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }
  return { cur, best: Math.max(best, cur) };
}

function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toast.id);
  toast.id = setTimeout(() => t.classList.remove('show'), 3000);
}

function message(todayMin, remaining) {
  const h = new Date().getHours();
  const left = settings.goal - todayMin;
  const who = settings.name ? `${settings.name}님, ` : '';
  if (left <= 0) return `${who}오늘 목표를 달성했어요! 정말 멋져요.`;
  if (todayMin === 0) return h < 12 ? `${who}좋은 아침이에요. 첫 세션을 시작해볼까요?` : `${who}오늘 아직 기록이 없어요. ${settings.focus}분만 집중해볼까요?`;
  return `${who}목표까지 ${left}분 남았어요.` + (remaining ? ` 남은 할 일 ${remaining}개` : '');
}

function applyTheme() {
  const r = document.documentElement;
  r.dataset.theme = settings.theme;
  const a = isColor(settings.accent) ? settings.accent : DEFAULTS.accent;
  r.style.setProperty('--accent', a);
  r.style.setProperty('--accent-soft', a + '22');
}

const setBar = (barId, pId, p) => {
  $(barId).style.setProperty('--p', p + '%');
  $(pId).textContent = p + '%';
};

function weekDays() {
  const now = new Date();
  const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) + weekOffset * 7);
  return Array.from({ length: 7 }, (_, i) => new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i));
}

function renderHeader() {
  const t = todayStr();
  const todayMin = dayTotal(t);
  const todays = tasks.filter(x => x.date === t);
  const h = new Date().getHours();
  const who = settings.name ? `, ${settings.name}님` : '';
  $('p-avatar').textContent = settings.avatar;
  $('p-name').textContent = settings.name || '학습자';
  $('hero-title').textContent = `${h < 12 ? '좋은 아침이에요' : h < 18 ? '안녕하세요' : '좋은 저녁이에요'}${who}, 오늘도 목표를 향해 공부해봐요 🌱`;
  $('side-msg').textContent = message(todayMin, todays.filter(x => !x.done).length);
  $('side-bar').style.width = Math.min(100, pct(todayMin, settings.goal)) + '%';
  $('side-quote').textContent = `“ ${QUOTES[quoteIdx]} ”`;
  const upcoming = exams.some(e => daysUntil(e.date) >= 0 && daysUntil(e.date) <= 7);
  $('bell-badge').classList.toggle('on', upcoming || todays.some(x => !x.done));
}

function renderCards() {
  const t = todayStr();
  const todays = tasks.filter(x => x.date === t);
  const doneToday = todays.filter(x => x.done).length;
  $('c-goal-v').textContent = `${doneToday} / ${todays.length}`;
  setBar('c-goal-bar', 'c-goal-p', pct(doneToday, todays.length));

  const m = dayTotal(t);
  $('c-time-v').textContent = m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`;
  $('c-time-sub').textContent = `목표 ${settings.goal >= 60 && settings.goal % 60 === 0 ? settings.goal / 60 + '시간' : settings.goal + '분'}`;
  setBar('c-time-bar', 'c-time-p', Math.min(100, pct(m, settings.goal)));

  const keys = weekDays().map(iso);
  const week = tasks.filter(x => keys.includes(x.date));
  const wd = week.filter(x => x.done).length;
  $('c-done-v').textContent = `${wd} / ${week.length}`;
  setBar('c-done-bar', 'c-done-p', pct(wd, week.length));

  const next = [...exams].filter(e => daysUntil(e.date) >= 0).sort((a, b) => a.date.localeCompare(b.date))[0];
  $('c-exam-name').textContent = next ? next.name : '없음';
  $('c-exam-date').textContent = next
    ? `${new Date(next.date + 'T00:00:00').toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })} (${ddLabel(daysUntil(next.date))})`
    : '시험을 등록해보세요';
}

function renderCalendar() {
  const days = weekDays();
  const t = todayStr();
  const fmt = d => d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
  $('cal-title').textContent = `${days[0].getFullYear()}년 ${fmt(days[0])} - ${fmt(days[6])}`;

  const names = ['월', '화', '수', '목', '금', '토', '일'];
  $('cal-head').replaceChildren(mk('div'), ...days.map((d, i) =>
    mk('div', { className: iso(d) === t ? 'today' : '' }, names[i], mk('small', {}, `${d.getMonth() + 1}/${d.getDate()}`))));

  const times = mk('div', { className: 'cal-times' });
  for (let h = CAL_START; h <= CAL_END; h += 2) {
    const s = mk('span', {}, `${pad(h)}:00`);
    s.style.top = (h - CAL_START) * HOUR_PX + 'px';
    times.append(s);
  }
  const cols = days.map(d => {
    const col = mk('div', { className: 'cal-col' });
    tasks.filter(x => x.date === iso(d) && x.start).forEach(x => {
      const s = Math.max(toMin(x.start), CAL_START * 60);
      const e = Math.min(toMin(x.start) + x.minutes, CAL_END * 60);
      if (e <= s) return;
      const c = subjectColor(x.subject);
      const ev = mk('div', { className: 'ev' + (x.done ? ' done' : '') },
        mk('b', {}, x.title), `${fmtTime(toMin(x.start))} - ${fmtTime(toMin(x.start) + x.minutes)}`);
      ev.style.top = (s - CAL_START * 60) / 60 * HOUR_PX + 'px';
      ev.style.height = Math.max(22, (e - s) / 60 * HOUR_PX) + 'px';
      ev.style.background = c + '26';
      ev.style.borderColor = c;
      col.append(ev);
    });
    return col;
  });
  $('cal-body').style.height = (CAL_END - CAL_START) * HOUR_PX + 'px';
  $('cal-body').replaceChildren(times, ...cols);
}

function renderToday() {
  const t = todayStr();
  const todays = tasks.filter(x => x.date === t).sort((a, b) => (a.start || '99').localeCompare(b.start || '99'));
  $('today-count').textContent = `${todays.filter(x => x.done).length} / ${todays.length} 완료`;
  $('today-list').replaceChildren(...(todays.length ? todays.map(x => {
    const check = mk('button', { className: 'check' + (x.done ? ' on' : ''), ariaLabel: '완료 토글' }, svgIcon('i-check'));
    check.onclick = () => { x.done = !x.done; save(); renderAll(); };
    const tag = mk('span', { className: 'tag' }, x.subject || OTHER);
    tag.style.setProperty('--c', subjectColor(x.subject));
    const del = mk('button', { className: 'x', textContent: '✕', ariaLabel: '삭제' });
    del.onclick = () => { tasks = tasks.filter(y => y !== x); save(); renderAll(); };
    return mk('li', { className: x.done ? 'done' : '' }, check, mk('span', { className: 't', textContent: x.title }), tag,
      mk('span', { className: 'dur' }, fmtDur(x.minutes)), del);
  }) : [mk('li', { className: 'empty' }, '오늘 할 일이 없어요')]));
}

function renderProgress() {
  const bySub = {};
  tasks.forEach(x => { const s = x.subject || OTHER; (bySub[s] ||= { total: 0, done: 0 }); bySub[s].total++; if (x.done) bySub[s].done++; });
  const entries = Object.entries(bySub).sort((a, b) => b[1].total - a[1].total);
  const total = tasks.length, done = tasks.filter(x => x.done).length;
  $('subj-total').textContent = pct(done, total) + '%';
  $('donut2-t').textContent = pct(done, total) + '%';

  let acc = 0;
  const stops = entries.map(([s, v]) => {
    const w = v.total / total * 100, c = subjectColor(s), mid = acc + w * v.done / v.total;
    const part = `${c} ${acc}% ${mid}%,${c}33 ${mid}% ${acc + w}%`;
    acc += w;
    return part;
  });
  $('donut2').style.background = total ? `conic-gradient(${stops.join(',')})` : '';
  $('subj-list').replaceChildren(...(entries.length ? entries.slice(0, 5).map(([s, v]) => {
    const c = subjectColor(s), p = pct(v.done, v.total);
    const dot = mk('span', { className: 'dot' }); dot.style.background = c;
    const fill = mk('i'); fill.style.width = p + '%'; fill.style.background = c;
    return mk('li', {}, dot, mk('span', { className: 'n', textContent: s }), mk('span', { className: 'tr' }, fill), mk('span', { className: 'p' }, p + '%'));
  }) : [mk('li', { className: 'muted' }, '할 일을 추가하면 진도가 보여요')]));
}

function renderStreak() {
  const { cur, best } = streaks();
  $('streak-n').textContent = cur;
  $('streak-best').textContent = best;
  $('streak-days').replaceChildren(...Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    return mk('div', { className: 'flame' + (dayTotal(iso(d)) > 0 ? ' on' : '') + (i === 6 ? ' today' : '') },
      svgIcon('i-flame', 'ic fill'), i === 6 ? '오늘' : `${d.getMonth() + 1}/${d.getDate()}`);
  }));
  $('streak-quote').textContent = QUOTES[(quoteIdx + 1) % QUOTES.length];
  $('q-text').textContent = QUOTES[quoteIdx];
}

function renderPlanner() {
  const t = todayStr();
  $('date').value ||= t;
  $('subjects').replaceChildren(...knownSubjects().map(s => mk('option', { value: s })));
  const q = query.toLowerCase();
  const shown = tasks.filter(x =>
    (filter === 'today' ? x.date === t : filter === 'todo' ? !x.done : filter === 'done' ? x.done : true) &&
    (!q || x.title.toLowerCase().includes(q) || (x.subject || '').toLowerCase().includes(q)))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.start || '').localeCompare(b.start || ''));

  $('list').replaceChildren(...(shown.length ? shown.map(x => {
    const late = x.date < t && !x.done;
    const c = subjectColor(x.subject);
    const done = mk('button', { className: 'btn' + (x.done ? ' on' : ''), textContent: x.done ? '완료됨' : '완료' });
    done.onclick = () => { x.done = !x.done; save(); renderAll(); };
    const del = mk('button', { className: 'del', textContent: '삭제' });
    del.onclick = () => { tasks = tasks.filter(y => y !== x); save(); renderAll(); };
    const ico = mk('div', { className: 'ico' }, (x.subject || x.title).charAt(0));
    ico.style.background = c + '22'; ico.style.color = c;
    const when = x.start ? `${x.date} ${fmtTime(toMin(x.start))}` : x.date;
    return mk('li', { className: x.done ? 'done' : '' }, ico,
      mk('div', { className: 'info' },
        mk('div', { className: 'meta' }, `${x.subject ? x.subject + ' · ' : ''}${when} · ${fmtDur(x.minutes)}${x.spent ? ` · 공부 ${x.spent}분` : ''}`,
          late ? mk('span', { className: 'late', textContent: ' · 기한 지남' }) : ''),
        mk('div', { className: 't', textContent: x.title })),
      mk('div', { className: 'acts' }, done, del));
  }) : [mk('li', { className: 'empty' }, '할 일이 없어요')]));

  const sel = $('t-link');
  const prev = sel.value;
  sel.replaceChildren(mk('option', { value: '' }, '할 일 연결 안 함'),
    ...tasks.filter(x => !x.done).map(x => mk('option', { value: String(x.id) }, `${x.subject ? x.subject + ' · ' : ''}${x.title}`)));
  if ([...sel.options].some(o => o.value === prev)) sel.value = prev;

  const rows = [...exams].sort((a, b) => a.date.localeCompare(b.date)).map(e => {
    const del = mk('button', { className: 'del', textContent: '삭제' });
    del.onclick = () => { exams = exams.filter(y => y !== e); save(); renderAll(); };
    return mk('li', {}, mk('div', { className: 'dd' }, ddLabel(daysUntil(e.date))),
      mk('div', { className: 'info' }, mk('div', { className: 't', textContent: e.name }), mk('div', { className: 'meta', textContent: e.date })), del);
  });
  $('exam-list').replaceChildren(...(rows.length ? rows : [mk('li', { className: 'empty' }, '등록된 시험이 없어요')]));
}

function renderStats() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push({ key: iso(d), label: d.toLocaleDateString('ko-KR', { weekday: 'short' }), total: dayTotal(iso(d)) });
  }
  const max = Math.max(settings.goal, ...days.map(d => d.total));
  $('w-total').textContent = days.reduce((a, d) => a + d.total, 0);
  $('week-bars').replaceChildren(...days.map((d, i) => {
    const b = mk('div', { className: 'b' });
    b.style.height = (d.total / max * 100) + '%';
    return mk('div', { className: 'col' + (i === 6 ? ' today' : '') }, mk('small', {}, String(d.total)), b, mk('small', {}, d.label));
  }));
  const bySubject = {};
  days.forEach(d => Object.entries(log[d.key] || {}).forEach(([s, m]) => { bySubject[s] = (bySubject[s] || 0) + m; }));
  const entries = Object.entries(bySubject).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((a, [, m]) => a + m, 0);
  let acc = 0;
  const stops = entries.map(([s, m]) => { const from = acc / total * 100; acc += m; return `${subjectColor(s)} ${from}% ${acc / total * 100}%`; });
  $('donut').style.background = total ? `conic-gradient(${stops.join(',')})` : '';
  $('legend').replaceChildren(...(entries.length ? entries.map(([s, m]) => {
    const dot = mk('span', { className: 'dot' }); dot.style.background = subjectColor(s);
    return mk('li', {}, dot, `${s} ${m}분`);
  }) : [mk('li', {}, '기록이 없어요')]));
}

function renderSettings() {
  $('set-name').value = settings.name;
  $('set-goal').value = settings.goal;
  $('set-focus').value = settings.focus;
  $('set-brk').value = settings.brk;
  $('set-theme').value = settings.theme;
  $('set-accent').value = isColor(settings.accent) ? settings.accent : DEFAULTS.accent;
  $('avatar-pick').replaceChildren(...AVATARS.map(a => {
    const b = mk('button', { type: 'button', className: a === settings.avatar ? 'on' : '', textContent: a });
    b.onclick = () => { settings.avatar = a; save(); renderAll(); renderSettings(); };
    return b;
  }));
  const subs = knownSubjects();
  $('color-list').replaceChildren(...(subs.length ? subs.map(s => {
    const input = mk('input', { type: 'color', value: subjectColor(s) });
    input.onchange = () => { colors[s] = input.value; save(); renderAll(); };
    return mk('label', {}, input, s);
  }) : [mk('span', { className: 'muted' }, '할 일을 추가하면 과목 색상을 정할 수 있어요')]));
}

function renderAll() {
  applyTheme();
  renderHeader();
  renderCards();
  renderCalendar();
  renderToday();
  renderProgress();
  renderStreak();
  renderPlanner();
  renderStats();
  if (!running) resetTimerState();
  else drawTimer();
}

// 화면 전환
function setView(v) {
  view = VIEWS.includes(v) ? v : 'dash';
  document.body.dataset.view = view;
  document.querySelectorAll('[data-views]').forEach(p => { p.hidden = !p.dataset.views.split(' ').includes(view); });
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('on', a.dataset.view === view));
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', () => setView(location.hash.slice(1)));

$('search').oninput = e => {
  query = e.target.value.trim();
  if (query && view !== 'plan') location.hash = '#plan';
  renderPlanner();
};
$('bell').onclick = () => {
  const t = todayStr();
  const left = tasks.filter(x => x.date === t && !x.done).length;
  const next = exams.filter(e => daysUntil(e.date) >= 0).sort((a, b) => a.date.localeCompare(b.date))[0];
  toast(`오늘 남은 할 일 ${left}개` + (next ? ` · ${next.name} ${ddLabel(daysUntil(next.date))}` : ''));
};
$('profile-btn').onclick = () => { location.hash = '#set'; };
$('q-next').onclick = () => { quoteIdx = (quoteIdx + 1) % QUOTES.length; renderStreak(); renderHeader(); };
$('cal-prev').onclick = () => { weekOffset--; renderCalendar(); };
$('cal-next').onclick = () => { weekOffset++; renderCalendar(); };
$('cal-today').onclick = () => { weekOffset = 0; renderCalendar(); };

// 메모
$('memo-btn').onclick = () => { $('memo-text').value = memo; $('memo-dialog').showModal(); };
$('memo-text').oninput = e => { memo = e.target.value; localStorage.setItem('planner.memo', JSON.stringify(memo)); };
$('memo-close').onclick = () => $('memo-dialog').close();

// 설정
const bindSetting = (id, key, parse) => {
  $(id).onchange = () => {
    const v = parse($(id).value);
    if (v === null) { renderSettings(); return; }
    settings[key] = v;
    save(); renderAll();
  };
};
const num = (min, max) => v => { const n = Math.round(+v); return n >= min && n <= max ? n : null; };
bindSetting('set-name', 'name', v => v.trim());
bindSetting('set-goal', 'goal', num(10, 1440));
bindSetting('set-focus', 'focus', num(1, 180));
bindSetting('set-brk', 'brk', num(1, 60));
bindSetting('set-theme', 'theme', v => (v === 'dark' ? 'dark' : 'light'));
bindSetting('set-accent', 'accent', v => (isColor(v) ? v : null));

// 입력 폼
$('form').onsubmit = e => {
  e.preventDefault();
  tasks.push({
    id: Date.now(), title: $('title').value.trim(), subject: $('subject').value.trim(),
    date: $('date').value, start: $('start').value || '', minutes: +$('minutes').value || 60, done: false, spent: 0
  });
  $('title').value = '';
  save(); renderAll(); renderSettings();
  toast('할 일을 추가했어요');
};
$('exam-form').onsubmit = e => {
  e.preventDefault();
  exams.push({ name: $('exam-name').value.trim(), date: $('exam-date').value });
  $('exam-name').value = '';
  save(); renderAll();
};
document.querySelectorAll('[data-f]').forEach(b => b.onclick = () => {
  filter = b.dataset.f;
  document.querySelectorAll('[data-f]').forEach(x => x.classList.toggle('on', x === b));
  renderPlanner();
});

// 타이머 (pomo: 집중/휴식 반복, normal: 한 번 카운트다운, stop: 스톱워치)
let tmode = 'pomo', phase = 'focus', running = false, left = 0, elapsed = 0, endAt = 0, startAt = 0, baseElapsed = 0, iv = null;
const CIRC = 326.7;
const phaseSeconds = () => (phase === 'focus' ? settings.focus : settings.brk) * 60;
function drawTimer() {
  const secs = tmode === 'stop' ? elapsed : left;
  const h = Math.floor(secs / 3600);
  $('timer').textContent = h ? `${h}:${pad(Math.floor(secs / 60) % 60)}:${pad(secs % 60)}` : `${pad(Math.floor(secs / 60))}:${pad(secs % 60)}`;
  const frac = tmode === 'stop' ? (elapsed % 3600) / 3600 : 1 - left / phaseSeconds();
  $('ring-fg').style.strokeDashoffset = CIRC * (1 - Math.min(1, Math.max(0, frac)));
  $('t-label').textContent = tmode === 'stop' ? '공부 중' : phase === 'focus' ? '집중하기' : '휴식하기';
  document.querySelector('.ring').classList.toggle('rest', phase === 'break' && tmode === 'pomo');
  document.querySelector('#t-start span').textContent = running ? '일시정지' : '시작하기';
}
function resetTimerState() {
  left = tmode === 'stop' ? 0 : phaseSeconds();
  elapsed = 0;
  drawTimer();
}
function stopTick() { clearInterval(iv); iv = null; running = false; }
function addStudy(minutes) {
  if (minutes < 1) return;
  const task = tasks.find(x => String(x.id) === $('t-link').value);
  const day = todayStr(), subject = task?.subject || OTHER;
  log[day] = log[day] || {};
  log[day][subject] = (log[day][subject] || 0) + minutes;
  if (task) task.spent = (task.spent || 0) + minutes;
  save();
}
function finishSession() {
  stopTick();
  if (phase === 'focus') {
    addStudy(settings.focus);
    toast(tmode === 'pomo' ? `집중 ${settings.focus}분 기록 완료! 잠깐 쉬어가요` : `집중 ${settings.focus}분 기록 완료!`);
    phase = tmode === 'pomo' ? 'break' : 'focus';
  } else {
    toast('휴식 끝! 다시 집중해볼까요?');
    phase = 'focus';
  }
  renderAll();
}
$('t-start').onclick = () => {
  if (running) { stopTick(); drawTimer(); return; }
  running = true;
  if (tmode === 'stop') { startAt = Date.now(); baseElapsed = elapsed; }
  else endAt = Date.now() + left * 1000;
  iv = setInterval(() => {
    if (tmode === 'stop') elapsed = baseElapsed + Math.floor((Date.now() - startAt) / 1000);
    else {
      left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      if (left === 0) { finishSession(); return; }
    }
    drawTimer();
  }, 250);
  drawTimer();
};
$('t-reset').onclick = () => {
  stopTick();
  if (tmode === 'stop' && elapsed >= 60) {
    addStudy(Math.floor(elapsed / 60));
    toast(`${Math.floor(elapsed / 60)}분 기록 완료!`);
  }
  phase = 'focus';
  renderAll();
};
document.querySelectorAll('[data-tm]').forEach(b => b.onclick = () => {
  stopTick();
  tmode = b.dataset.tm;
  phase = 'focus';
  document.querySelectorAll('[data-tm]').forEach(x => x.classList.toggle('on', x === b));
  resetTimerState();
});

let noise = null;
$('t-noise').onclick = () => {
  const btn = $('t-noise');
  if (noise) { noise.stop(); noise = null; btn.classList.remove('on'); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) { toast('이 브라우저는 백색소음을 지원하지 않아요'); return; }
  const ctx = new AC();
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  src.buffer = buf; src.loop = true; gain.gain.value = 0.04;
  src.connect(gain).connect(ctx.destination);
  src.start();
  noise = { stop() { src.stop(); ctx.close(); } };
  btn.classList.add('on');
};

// 데이터 내보내기/가져오기
$('export').onclick = () => {
  const blob = new Blob([JSON.stringify({ settings, tasks, log, colors, exams }, null, 2)], { type: 'application/json' });
  const a = mk('a', { href: URL.createObjectURL(blob), download: `studyflow-${todayStr()}.json` });
  a.click();
  URL.revokeObjectURL(a.href);
};
$('import').onclick = () => $('import-file').click();
$('import-file').onchange = async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
    if (!Array.isArray(d.tasks) || !isObj(d.log) || !Array.isArray(d.exams) || !isObj(d.settings) || !isObj(d.colors)) throw new Error('형식 오류');
    settings = { ...DEFAULTS, ...d.settings };
    tasks = d.tasks.map(x => ({ start: '', spent: 0, minutes: 60, ...x }));
    log = d.log; colors = d.colors; exams = d.exams;
    save(); renderAll(); renderSettings();
    toast('데이터를 가져왔어요');
  } catch {
    toast('가져오기에 실패했어요. 올바른 파일인지 확인해주세요');
  }
};

tasks = tasks.map(x => ({ start: '', spent: 0, ...x }));
renderAll();
renderSettings();
setView(location.hash.slice(1));
