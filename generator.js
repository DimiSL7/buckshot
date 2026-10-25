/**
 * Логика загрузки Buckshot Roulette.
 * Чистые функции без DOM: одинаково работают в браузере и в тестах.
 */

export const BULLET = Object.freeze({
  LIVE: 'live',
  BLANK: 'blank',
  GOLD: 'gold',
  PURPLE: 'purple',
});

/**
 * Состав загрузки. weight — вес комбинации в процентах
 * (в сумме ровно 100), а не вероятность каждого патрона отдельно.
 */
export const COMBINATIONS = Object.freeze([
  Object.freeze({ blanks: 2, lives: 1, weight: 15.5 }),
  Object.freeze({ blanks: 2, lives: 2, weight: 15.5 }),
  Object.freeze({ blanks: 3, lives: 1, weight: 15.5 }),
  Object.freeze({ blanks: 3, lives: 2, weight: 15.5 }),
  Object.freeze({ blanks: 2, lives: 3, weight: 15.5 }),
  Object.freeze({ blanks: 3, lives: 3, weight: 9.75 }),
  Object.freeze({ blanks: 4, lives: 2, weight: 9.75 }),
  Object.freeze({ blanks: 4, lives: 3, weight: 1 }),
  Object.freeze({ blanks: 5, lives: 2, weight: 1 }),
  Object.freeze({ blanks: 3, lives: 4, weight: 1 }),
]);

/** Один взвешенный выбор состава. */
export function pickCombination(rng = Math.random) {
  const total = COMBINATIONS.reduce((sum, item) => sum + item.weight, 0);
  let roll = rng() * total;

  for (const combination of COMBINATIONS) {
    roll -= combination.weight;
    if (roll < 0) return combination;
  }

  // Страховка от погрешности чисел с плавающей точкой.
  return COMBINATIONS[COMBINATIONS.length - 1];
}

function shuffle(items, rng) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const temporary = items[i];
    items[i] = items[j];
    items[j] = temporary;
  }
  return items;
}

function clampPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(100, Math.max(0, number));
}

/**
 * Заменяет один случайный патрон нужного типа на особый.
 * Если подходящего места нет, загрузка остаётся прежней.
 */
function replaceBullet(bullets, from, to, enabled, chance, rng) {
  if (enabled !== true) return;

  const percent = clampPercent(chance);
  if (percent <= 0) return;
  if (percent < 100 && rng() * 100 >= percent) return;

  const positions = [];
  for (let i = 0; i < bullets.length; i += 1) {
    if (bullets[i] === from) positions.push(i);
  }
  if (positions.length === 0) return;

  const index = positions[Math.floor(rng() * positions.length)];
  bullets[index] = to;
}

/**
 * Собирает загрузку: сначала состав по весам, затем перемешивание,
 * затем независимая замена обычных патронов на особые.
 */
export function buildLoad(settings = {}, rng = Math.random) {
  const { blanks, lives } = pickCombination(rng);
  const bullets = [];

  for (let i = 0; i < blanks; i += 1) bullets.push(BULLET.BLANK);
  for (let i = 0; i < lives; i += 1) bullets.push(BULLET.LIVE);

  shuffle(bullets, rng);

  replaceBullet(bullets, BULLET.LIVE, BULLET.GOLD, settings.goldEnabled, settings.goldChance, rng);
  replaceBullet(bullets, BULLET.BLANK, BULLET.PURPLE, settings.purpleEnabled, settings.purpleChance, rng);

  return bullets;
}
