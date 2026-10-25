import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULTS,
  SETTINGS_KEY,
  loadSettings,
  sanitizeSettings,
  saveSettings,
} from '../settings.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    read: (key) => values.get(key),
  };
}

test('значения по умолчанию соответствуют договорённостям', () => {
  assert.deepEqual(DEFAULTS, {
    goldEnabled: false,
    goldChance: 20,
    purpleEnabled: false,
    purpleChance: 20,
    showSpecialsOnLoad: true,
    historyEnabled: true,
    countEnabled: true,
    vibrationEnabled: true,
    vibrationLevel: 'medium',
  });
});

test('sanitizeSettings заполняет пропуски и отбрасывает лишние поля', () => {
  const result = sanitizeSettings({ historyEnabled: false });

  assert.deepEqual(Object.keys(result).sort(), Object.keys(DEFAULTS).sort());
  assert.equal(result.historyEnabled, false);
  assert.equal(result.countEnabled, DEFAULTS.countEnabled);
  assert.equal(result.goldChance, DEFAULTS.goldChance);
  assert.equal(result.extra, undefined);
});

test('sanitizeSettings ограничивает и округляет проценты', () => {
  assert.equal(sanitizeSettings({ goldChance: -30 }).goldChance, 0);
  assert.equal(sanitizeSettings({ goldChance: 150 }).goldChance, 100);
  assert.equal(sanitizeSettings({ goldChance: 33.6 }).goldChance, 34);
  assert.equal(sanitizeSettings({ goldChance: '55' }).goldChance, 55);
  assert.equal(sanitizeSettings({ goldChance: Number.NaN }).goldChance, DEFAULTS.goldChance);
  assert.equal(sanitizeSettings({ goldChance: null }).goldChance, DEFAULTS.goldChance);
  assert.equal(sanitizeSettings({ purpleChance: 'abc' }).purpleChance, DEFAULTS.purpleChance);
});

test('sanitizeSettings принимает только известный уровень вибрации', () => {
  assert.equal(sanitizeSettings({ vibrationLevel: 'strong' }).vibrationLevel, 'strong');
  assert.equal(sanitizeSettings({ vibrationLevel: 'turbo' }).vibrationLevel, 'medium');
  assert.equal(sanitizeSettings({ vibrationLevel: 42 }).vibrationLevel, 'medium');
});

test('особые патроны на превью показываются по умолчанию и маскируются по настройке', () => {
  assert.equal(DEFAULTS.showSpecialsOnLoad, true);
  assert.equal(sanitizeSettings({}).showSpecialsOnLoad, true);
  assert.equal(sanitizeSettings({ showSpecialsOnLoad: false }).showSpecialsOnLoad, false);
  assert.equal(sanitizeSettings({ showSpecialsOnLoad: 'no' }).showSpecialsOnLoad, true);
});

test('loadSettings возвращает значения по умолчанию без сохранённых данных', () => {
  assert.deepEqual(loadSettings(memoryStorage()), DEFAULTS);
});

test('loadSettings читает сохранённые настройки и чинит их', () => {
  const storage = memoryStorage({
    [SETTINGS_KEY]: JSON.stringify({
      goldEnabled: true,
      goldChance: 140,
      historyEnabled: false,
      vibrationLevel: 'strong',
    }),
  });

  const settings = loadSettings(storage);

  assert.equal(settings.goldEnabled, true);
  assert.equal(settings.goldChance, 100);
  assert.equal(settings.historyEnabled, false);
  assert.equal(settings.countEnabled, DEFAULTS.countEnabled);
  assert.equal(settings.vibrationLevel, 'strong');
});

test('loadSettings переживает повреждённый JSON и недоступное хранилище', () => {
  const broken = memoryStorage({ [SETTINGS_KEY]: '{"goldEnabled": true' });
  assert.deepEqual(loadSettings(broken), DEFAULTS);

  const throwing = {
    getItem() {
      throw new Error('storage disabled');
    },
  };
  assert.deepEqual(loadSettings(throwing), DEFAULTS);
});

test('saveSettings сохраняет только известные поля в проверенном виде', () => {
  const storage = memoryStorage();
  const saved = saveSettings(
    {
      goldEnabled: true,
      goldChance: -10,
      purpleChance: 77.7,
      historyEnabled: false,
      unknown: 'ignore me',
    },
    storage,
  );

  assert.equal(saved, true);

  const raw = JSON.parse(storage.read(SETTINGS_KEY));
  assert.deepEqual(Object.keys(raw).sort(), Object.keys(DEFAULTS).sort());
  assert.equal(raw.goldEnabled, true);
  assert.equal(raw.goldChance, 0);
  assert.equal(raw.purpleChance, 78);
  assert.equal(raw.historyEnabled, false);
  assert.equal(raw.unknown, undefined);
});

test('saveSettings не падает, если запись запрещена', () => {
  const storage = {
    setItem() {
      throw new Error('quota exceeded');
    },
  };
  assert.equal(saveSettings(DEFAULTS, storage), false);
});
