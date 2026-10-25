/** Пользовательские настройки: значения по умолчанию, проверка, localStorage. */

export const SETTINGS_KEY = 'buckshot.settings.v1';
export const VIBRATION_LEVELS = Object.freeze(['weak', 'medium', 'strong']);

export const DEFAULTS = Object.freeze({
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

function clampPercent(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(100, Math.max(0, Math.round(number)));
}

/** Приводит любые сохранённые данные к известной и безопасной форме. */
export function sanitizeSettings(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const boolean = (key) => (
    typeof source[key] === 'boolean' ? source[key] : DEFAULTS[key]
  );

  return {
    goldEnabled: boolean('goldEnabled'),
    goldChance: clampPercent(source.goldChance, DEFAULTS.goldChance),
    purpleEnabled: boolean('purpleEnabled'),
    purpleChance: clampPercent(source.purpleChance, DEFAULTS.purpleChance),
    showSpecialsOnLoad: boolean('showSpecialsOnLoad'),
    historyEnabled: boolean('historyEnabled'),
    countEnabled: boolean('countEnabled'),
    vibrationEnabled: boolean('vibrationEnabled'),
    vibrationLevel: VIBRATION_LEVELS.includes(source.vibrationLevel)
      ? source.vibrationLevel
      : DEFAULTS.vibrationLevel,
  };
}

export function loadSettings(storage) {
  try {
    const store = storage ?? globalThis.localStorage;
    const saved = store?.getItem(SETTINGS_KEY);
    if (!saved) return { ...DEFAULTS };
    return sanitizeSettings(JSON.parse(saved));
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings, storage) {
  try {
    const store = storage ?? globalThis.localStorage;
    store?.setItem(SETTINGS_KEY, JSON.stringify(sanitizeSettings(settings)));
    return true;
  } catch {
    return false;
  }
}
