import { BULLET, buildLoad } from './generator.js';
import { loadSettings, saveSettings, sanitizeSettings } from './settings.js';

const TYPE_INFO = {
  [BULLET.LIVE]: { label: 'Боевой', hint: 'тип известен' },
  [BULLET.BLANK]: { label: 'Холостой', hint: 'тип известен' },
  [BULLET.GOLD]: { label: 'Золотой', hint: 'особый патрон' },
  [BULLET.PURPLE]: { label: 'Фиолетовый', hint: 'особый патрон' },
};

const HOLD_MS = 1500;
const VIBRATION_MS = { weak: 12, medium: 30, strong: 60 };

const LOAD_ORDER = {
  [BULLET.PURPLE]: 0,
  [BULLET.BLANK]: 1,
  [BULLET.LIVE]: 2,
  [BULLET.GOLD]: 3,
};

const els = {
  stage: document.getElementById('stage'),
  shell: document.getElementById('shell'),
  shellWrap: document.getElementById('shellWrap'),
  loadStrip: document.getElementById('loadStrip'),
  title: document.getElementById('stageTitle'),
  hint: document.getElementById('stageHint'),
  board: document.querySelector('.board'),
  controls: document.querySelector('.controls'),
  mag: document.getElementById('mag'),
  magCells: document.getElementById('magCells'),
  readout: document.getElementById('readout'),
  readoutLabel: document.getElementById('readoutLabel'),
  readoutValue: document.getElementById('readoutValue'),
  loupe: document.getElementById('loupeBtn'),
  fire: document.getElementById('fireBtn'),
  fireLabel: document.getElementById('fireLabel'),
  reload: document.getElementById('reloadBtn'),
  reloadSub: document.getElementById('reloadSub'),
  settingsBtn: document.getElementById('settingsBtn'),
  dialog: document.getElementById('settingsDialog'),
  closeSettings: document.getElementById('closeSettingsBtn'),
  goldEnabled: document.getElementById('goldEnabled'),
  goldChance: document.getElementById('goldChance'),
  goldValue: document.getElementById('goldValue'),
  goldRow: document.getElementById('goldRangeRow'),
  purpleEnabled: document.getElementById('purpleEnabled'),
  purpleChance: document.getElementById('purpleChance'),
  purpleValue: document.getElementById('purpleValue'),
  purpleRow: document.getElementById('purpleRangeRow'),
  showSpecialsOnLoad: document.getElementById('showSpecialsOnLoad'),
  historyEnabled: document.getElementById('historyEnabled'),
  countEnabled: document.getElementById('countEnabled'),
  vibrationEnabled: document.getElementById('vibrationEnabled'),
  vibrationLevels: document.getElementById('vibrationLevels'),
  srStatus: document.getElementById('srStatus'),
};

const vibrationRadios = Array.from(document.querySelectorAll('input[name="vibrationLevel"]'));
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

let settings = loadSettings();
let load = buildLoad(settings);
let loadSerial = 0;
let phase = 'loading';
let index = 0;
let revealed = false;
let firedBullet = null;
let history = [];
let busy = false;
let lastRemaining = null;

let holding = false;
let holdStart = 0;
let holdFrame = 0;
let suppressReloadClick = false;

function bulletsLabel(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  let word = 'патронов';

  if (mod10 === 1 && mod100 !== 11) word = 'патрон';
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) word = 'патрона';

  return `${count} ${word}`;
}

function remainingCount() {
  if (phase === 'loading') return load.length;
  if (phase === 'empty') return 0;
  return Math.max(0, load.length - index - (phase === 'fired' ? 1 : 0));
}

function canHoldReload() {
  return phase === 'play' || phase === 'fired';
}

function displayedLoadType(type) {
  if (settings.showSpecialsOnLoad) return type;
  if (type === BULLET.GOLD) return BULLET.LIVE;
  if (type === BULLET.PURPLE) return BULLET.BLANK;
  return type;
}

function render({ fresh = false } = {}) {
  const loading = phase === 'loading';
  const finished = phase === 'empty';
  const current = phase === 'play' || phase === 'fired' ? load[index] : null;
  const shownType = phase === 'fired'
    ? firedBullet
    : phase === 'play' && revealed
      ? current
      : null;
  const stageType = loading ? 'loading' : shownType ?? (finished ? 'empty' : 'hidden');

  els.stage.dataset.phase = phase;
  els.stage.dataset.type = stageType;
  els.shell.dataset.type = shownType ?? 'hidden';
  els.board.classList.toggle('is-loading', loading);
  els.controls.classList.toggle('is-loading', loading);

  if (loading) {
    els.title.textContent = 'Загрузка';
    els.hint.textContent = `${bulletsLabel(load.length)} · нажмите «Зарядить»`;
    els.stage.setAttribute('aria-label', `Загрузка: ${bulletsLabel(load.length)}`);
  } else if (phase === 'fired') {
    els.title.textContent = TYPE_INFO[firedBullet].label;
    els.hint.textContent = 'Нажмите «Выкинуть патрон»';
    els.stage.setAttribute('aria-label', `Выстрелянный патрон: ${TYPE_INFO[firedBullet].label}`);
  } else if (finished) {
    els.title.textContent = 'Загрузка пуста';
    els.hint.textContent = 'Начните новую загрузку';
    els.stage.setAttribute('aria-label', 'Текущий патрон: загрузка пуста');
  } else if (revealed) {
    els.title.textContent = TYPE_INFO[current].label;
    els.hint.textContent = TYPE_INFO[current].hint;
    els.stage.setAttribute('aria-label', `Текущий патрон: ${TYPE_INFO[current].label}`);
  } else {
    els.title.textContent = 'Патрон скрыт';
    els.hint.textContent = 'Нажмите «Лупу», чтобы посмотреть';
    els.stage.setAttribute('aria-label', 'Текущий патрон: скрыт');
  }

  const action = loading ? 'charge' : phase === 'fired' ? 'eject' : 'fire';
  els.fire.dataset.action = action;
  els.fireLabel.textContent = action === 'charge'
    ? 'Зарядить'
    : action === 'eject'
      ? 'Выкинуть патрон'
      : 'Выстрелить';
  els.fire.disabled = busy || finished;
  els.fire.setAttribute('aria-label', action === 'charge'
    ? 'Зарядить патроны'
    : action === 'eject'
      ? 'Выкинуть патрон'
      : 'Выстрелить');

  els.loupe.hidden = loading;
  els.loupe.disabled = busy || phase !== 'play' || revealed;

  els.reload.classList.toggle('is-ready', finished);
  els.reloadSub.textContent = canHoldReload() ? 'удерживайте 1,5 с' : 'нажмите';
  els.reload.setAttribute('aria-label', canHoldReload()
    ? 'Начать новую загрузку: удерживайте 1,5 секунды'
    : 'Начать новую загрузку');

  const remaining = remainingCount();
  els.readout.classList.toggle('is-hidden', !settings.countEnabled);
  els.readoutLabel.textContent = loading ? 'в загрузке' : 'осталось';
  els.readoutValue.textContent = String(remaining);

  if (settings.countEnabled) {
    els.readout.setAttribute('aria-label', `${loading ? 'В загрузке' : 'Осталось'} патронов: ${remaining}`);
    els.readout.removeAttribute('aria-hidden');
  } else {
    els.readout.setAttribute('aria-hidden', 'true');
    els.readout.removeAttribute('aria-label');
  }

  if (lastRemaining !== null && lastRemaining !== remaining && settings.countEnabled && !reduceMotion.matches) {
    els.readoutValue.animate(
      [
        { opacity: 0.25, transform: 'translateY(-5px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: 240, easing: 'ease-out' },
    );
  }
  lastRemaining = remaining;

  renderMagazine();
  if (loading) renderLoadStrip();
  if (fresh && !loading) animateEnter();
}

function renderLoadStrip() {
  const stripKey = `${loadSerial}:${settings.showSpecialsOnLoad}`;
  if (els.loadStrip.dataset.key === stripKey) return;
  els.loadStrip.dataset.key = stripKey;

  const fragment = document.createDocumentFragment();
  const grouped = load
    .map((type, originalIndex) => ({ type: displayedLoadType(type), originalIndex }))
    .sort((a, b) => LOAD_ORDER[a.type] - LOAD_ORDER[b.type] || a.originalIndex - b.originalIndex);

  grouped.forEach(({ type: shown }, indexInStrip) => {
    const shell = document.createElement('span');
    shell.className = `load-shell is-${shown}`;
    shell.style.setProperty('--i', String(indexInStrip));
    shell.setAttribute('role', 'listitem');
    shell.setAttribute('aria-label', `Тип патрона: ${TYPE_INFO[shown].label}`);

    const body = document.createElement('span');
    body.className = 'load-shell__body';
    const base = document.createElement('span');
    base.className = 'load-shell__base';
    shell.append(body, base);
    fragment.append(shell);
  });

  els.loadStrip.replaceChildren(fragment);
}

function renderMagazine() {
  if (els.magCells.dataset.total !== String(load.length)) {
    const cells = document.createDocumentFragment();
    for (let i = 0; i < load.length; i += 1) {
      const cell = document.createElement('span');
      cell.className = 'mag__cell';
      cells.append(cell);
    }
    els.magCells.replaceChildren(cells);
    els.magCells.dataset.total = String(load.length);
  }

  els.mag.classList.toggle('has-scale', settings.countEnabled);

  Array.from(els.magCells.children).forEach((cell, cellIndex) => {
    const usedType = history[cellIndex];
    cell.className = 'mag__cell';

    if (!usedType) return;

    if (settings.historyEnabled) {
      cell.classList.add('is-used', `is-${usedType}`);
    } else if (settings.countEnabled) {
      cell.classList.add('is-spent');
    }
  });
}

function animateEnter() {
  if (reduceMotion.matches) return;

  els.shellWrap.animate(
    [
      { opacity: 0, transform: 'translateY(14px) scale(0.97)' },
      { opacity: 1, transform: 'translateY(0) scale(1)' },
    ],
    { duration: 320, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
  );

  Array.from(els.magCells.children).forEach((cell, cellIndex) => {
    cell.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: 220, delay: 40 + cellIndex * 24, fill: 'backwards' },
    );
  });
}

function pulseShell() {
  if (reduceMotion.matches) return;
  els.shellWrap.animate(
    [
      { transform: 'scale(1)' },
      { transform: 'scale(1.05)' },
      { transform: 'scale(1)' },
    ],
    { duration: 340, easing: 'ease-out' },
  );
}

async function animateIn() {
  if (reduceMotion.matches) return;

  const animation = els.shellWrap.animate(
    [
      { opacity: 0, transform: 'translateY(-9%) scale(0.98)' },
      { opacity: 1, transform: 'translateY(0) scale(1)' },
    ],
    { duration: 260, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' },
  );

  try {
    await animation.finished;
  } catch {
    // См. animateOut: анимацию могли отменить закрытием вкладки.
  }
}

async function animateOut() {
  if (reduceMotion.matches) return;

  const animation = els.shellWrap.animate(
    [
      { opacity: 1, transform: 'translateY(0) rotate(0deg)' },
      { opacity: 0, transform: 'translateY(40%) rotate(2deg)' },
    ],
    { duration: 240, easing: 'cubic-bezier(0.5, 0, 0.75, 0)', fill: 'forwards' },
  );

  try {
    await animation.finished;
  } catch {
    // Анимацию могли отменить закрытием вкладки — это нормально.
  }
  animation.cancel();
}

async function animateRecoil() {
  if (reduceMotion.matches) return;

  const animation = els.shellWrap.animate(
    [
      { transform: 'translateY(0) rotate(0deg)' },
      { transform: 'translateY(13%) rotate(-1.2deg)', offset: 0.45 },
      { transform: 'translateY(0) rotate(0deg)' },
    ],
    { duration: 420, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
  );

  try {
    await animation.finished;
  } catch {
    // См. animateOut.
  }
}

async function charge() {
  if (phase !== 'loading' || busy) return;

  busy = true;
  render();
  vibrate('tap');

  if (!reduceMotion.matches) {
    const animation = els.loadStrip.animate(
      [
        { opacity: 1, transform: 'translateY(0) scale(1)' },
        { opacity: 0, transform: 'translateY(-14px) scale(0.98)' },
      ],
      { duration: 260, easing: 'ease-in' },
    );

    try {
      await animation.finished;
    } catch {
      // См. animateOut.
    }
    animation.cancel();
  }

  phase = 'play';
  index = 0;
  revealed = false;
  firedBullet = null;
  busy = false;
  render({ fresh: true });
  announce(`Заряжено. ${bulletsLabel(load.length)}.`);
}

async function fire() {
  if (busy) return;
  if (phase === 'loading') {
    await charge();
    return;
  }
  if (phase === 'fired') {
    await eject();
    return;
  }
  if (phase !== 'play') return;

  busy = true;
  firedBullet = load[index];
  revealed = true;
  phase = 'fired';
  render();
  vibrate('fire');

  await animateRecoil();

  busy = false;
  render();

  const parts = [`Выстрел. ${TYPE_INFO[firedBullet].label}.`];
  if (settings.countEnabled) {
    parts.push(remainingCount() === 0 ? 'Патронов не осталось.' : `Осталось ${remainingCount()}.`);
  }
  announce(parts.join(' '));
}

async function eject() {
  if (phase !== 'fired' || busy) return;

  busy = true;
  const spent = firedBullet;
  render();
  vibrate('tap');

  await animateOut();

  history.push(spent);
  firedBullet = null;
  index += 1;
  revealed = false;
  phase = index >= load.length ? 'empty' : 'play';
  render();

  await animateIn();

  busy = false;
  render();

  announce(phase === 'empty'
    ? 'Загрузка пуста.'
    : `Патрон выкинут. Осталось ${remainingCount()}.`);
}

function reveal() {
  if (busy || phase !== 'play' || revealed) return;

  revealed = true;
  vibrate('tap');
  render();
  pulseShell();
  announce(`Патрон: ${TYPE_INFO[load[index]].label}.`);
}

function startNewLoad() {
  if (busy) return;

  load = buildLoad(settings);
  loadSerial += 1;
  phase = 'loading';
  index = 0;
  revealed = false;
  firedBullet = null;
  history = [];
  lastRemaining = null;
  els.reload.style.setProperty('--hold', '0');
  render({ fresh: true });
  announce(`Новая загрузка. ${bulletsLabel(load.length)}.`);
}

function beginHold() {
  if (holding || busy || !canHoldReload()) return;

  holding = true;
  holdStart = performance.now();
  els.reload.classList.add('is-holding');
  els.reload.style.setProperty('--hold', '0');

  const tick = (now) => {
    if (!holding) return;

    const progress = Math.min(1, (now - holdStart) / HOLD_MS);
    els.reload.style.setProperty('--hold', progress.toFixed(4));

    if (progress >= 1) {
      finishHold();
      return;
    }

    holdFrame = requestAnimationFrame(tick);
  };

  holdFrame = requestAnimationFrame(tick);
}

function cancelHold() {
  if (!holding) return;

  holding = false;
  cancelAnimationFrame(holdFrame);
  els.reload.classList.remove('is-holding');
  els.reload.style.setProperty('--hold', '0');
}

function finishHold() {
  if (!holding) return;

  holding = false;
  cancelAnimationFrame(holdFrame);
  els.reload.classList.remove('is-holding');
  els.reload.style.setProperty('--hold', '0');
  suppressReloadClick = true;
  vibrate('reload');
  startNewLoad();
}

function vibrate(kind) {
  if (!settings.vibrationEnabled) return;
  if (typeof navigator.vibrate !== 'function') return;

  const strength = VIBRATION_MS[settings.vibrationLevel] ?? VIBRATION_MS.medium;
  const pattern = kind === 'reload'
    ? [strength, 55, strength]
    : kind === 'tap'
      ? Math.max(8, Math.round(strength * 0.45))
      : strength;

  navigator.vibrate(pattern);
}

function announce(text) {
  if (!els.srStatus) return;
  els.srStatus.textContent = '';
  window.setTimeout(() => {
    els.srStatus.textContent = text;
  }, 30);
}

function fillSettingsForm() {
  els.goldEnabled.checked = settings.goldEnabled;
  els.goldChance.value = String(settings.goldChance);
  els.purpleEnabled.checked = settings.purpleEnabled;
  els.purpleChance.value = String(settings.purpleChance);
  els.showSpecialsOnLoad.checked = settings.showSpecialsOnLoad;
  els.historyEnabled.checked = settings.historyEnabled;
  els.countEnabled.checked = settings.countEnabled;
  els.vibrationEnabled.checked = settings.vibrationEnabled;
  vibrationRadios.forEach((radio) => {
    radio.checked = radio.value === settings.vibrationLevel;
  });
  updateSettingsUI();
}

function updateSettingsUI() {
  els.goldEnabled.checked = settings.goldEnabled;
  els.purpleEnabled.checked = settings.purpleEnabled;
  els.showSpecialsOnLoad.checked = settings.showSpecialsOnLoad;
  els.historyEnabled.checked = settings.historyEnabled;
  els.countEnabled.checked = settings.countEnabled;
  els.vibrationEnabled.checked = settings.vibrationEnabled;

  els.goldValue.textContent = `${settings.goldChance}%`;
  els.purpleValue.textContent = `${settings.purpleChance}%`;
  els.goldChance.value = String(settings.goldChance);
  els.purpleChance.value = String(settings.purpleChance);
  els.goldChance.style.setProperty('--fill', `${settings.goldChance}%`);
  els.purpleChance.style.setProperty('--fill', `${settings.purpleChance}%`);

  els.goldChance.disabled = !settings.goldEnabled;
  els.purpleChance.disabled = !settings.purpleEnabled;
  els.goldRow.classList.toggle('is-off', !settings.goldEnabled);
  els.purpleRow.classList.toggle('is-off', !settings.purpleEnabled);

  els.vibrationLevels.classList.toggle('is-off', !settings.vibrationEnabled);
  vibrationRadios.forEach((radio) => {
    radio.disabled = !settings.vibrationEnabled;
    radio.checked = radio.value === settings.vibrationLevel;
  });
}

function commitSettings() {
  const level = vibrationRadios.find((radio) => radio.checked)?.value;

  settings = sanitizeSettings({
    goldEnabled: els.goldEnabled.checked,
    goldChance: els.goldChance.value,
    purpleEnabled: els.purpleEnabled.checked,
    purpleChance: els.purpleChance.value,
    showSpecialsOnLoad: els.showSpecialsOnLoad.checked,
    historyEnabled: els.historyEnabled.checked,
    countEnabled: els.countEnabled.checked,
    vibrationEnabled: els.vibrationEnabled.checked,
    vibrationLevel: level,
  });

  saveSettings(settings);
  updateSettingsUI();
  render();
}

function openSettings() {
  fillSettingsForm();
  if (!els.dialog.open) els.dialog.showModal();
}

function bindEvents() {
  els.loupe.addEventListener('click', reveal);
  els.fire.addEventListener('click', fire);

  els.reload.addEventListener('click', () => {
    if (busy) return;
    if (suppressReloadClick) {
      suppressReloadClick = false;
      return;
    }
    if (phase === 'loading' || phase === 'empty') {
      vibrate('reload');
      startNewLoad();
    }
  });

  els.reload.addEventListener('pointerdown', (event) => {
    suppressReloadClick = false;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (busy || !canHoldReload()) return;

    event.preventDefault();
    try {
      els.reload.setPointerCapture(event.pointerId);
    } catch {
      // Захват указателя не критичен для удержания.
    }
    beginHold();
  });

  ['pointerup', 'pointercancel', 'pointerleave'].forEach((eventName) => {
    els.reload.addEventListener(eventName, cancelHold);
  });

  els.reload.addEventListener('keydown', (event) => {
    suppressReloadClick = false;
    if (event.key !== ' ' && event.key !== 'Enter') return;
    if (event.repeat || busy || !canHoldReload()) return;

    event.preventDefault();
    beginHold();
  });

  els.reload.addEventListener('keyup', (event) => {
    if (event.key === ' ' || event.key === 'Enter') cancelHold();
  });

  els.reload.addEventListener('blur', cancelHold);
  els.reload.addEventListener('contextmenu', (event) => event.preventDefault());

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') cancelHold();
  });

  els.settingsBtn.addEventListener('click', openSettings);
  els.closeSettings.addEventListener('click', () => els.dialog.close());
  els.dialog.addEventListener('click', (event) => {
    if (event.target === els.dialog) els.dialog.close();
  });

  [
    els.goldEnabled,
    els.purpleEnabled,
    els.showSpecialsOnLoad,
    els.historyEnabled,
    els.countEnabled,
    els.vibrationEnabled,
  ].forEach((input) => input.addEventListener('change', commitSettings));

  [els.goldChance, els.purpleChance]
    .forEach((input) => input.addEventListener('input', commitSettings));

  vibrationRadios.forEach((radio) => radio.addEventListener('change', commitSettings));
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((error) => {
      console.warn('Service worker не зарегистрирован:', error);
    });
  });
}

render();
bindEvents();
registerServiceWorker();
