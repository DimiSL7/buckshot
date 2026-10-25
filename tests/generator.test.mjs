import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BULLET,
  COMBINATIONS,
  buildLoad,
  pickCombination,
} from '../generator.js';

function mulberry32(seed) {
  let state = seed >>> 0;
  return function random() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function keyOf(combination) {
  return `${combination.blanks}:${combination.lives}`;
}

function countTypes(bullets) {
  const counts = { blank: 0, live: 0, gold: 0, purple: 0 };
  for (const bullet of bullets) counts[bullet] += 1;
  return counts;
}

test('веса комбинаций в сумме дают ровно 100', () => {
  const total = COMBINATIONS.reduce((sum, item) => sum + item.weight, 0);
  assert.equal(total, 100);

  for (const item of COMBINATIONS) {
    assert.ok(item.blanks >= 2, 'холостых всегда минимум два');
    assert.ok(item.lives >= 1, 'боевой всегда минимум один');
    assert.equal(item.blanks + item.lives, item.blanks + item.lives);
  }
});

test('выбор состава соответствует таблице вероятностей', () => {
  const random = mulberry32(20261025);
  const iterations = 200_000;
  const counts = new Map(COMBINATIONS.map((item) => [keyOf(item), 0]));

  for (let i = 0; i < iterations; i += 1) {
    const combination = pickCombination(random);
    const key = keyOf(combination);
    counts.set(key, counts.get(key) + 1);
  }

  for (const combination of COMBINATIONS) {
    const actual = (counts.get(keyOf(combination)) / iterations) * 100;
    const deviation = Math.abs(actual - combination.weight);
    assert.ok(
      deviation < 0.35,
      `комбинация ${keyOf(combination)}: ${actual.toFixed(2)}% вместо ${combination.weight}%`,
    );
  }
});

test('каждая комбинация из таблицы достижима', () => {
  const random = mulberry32(7);
  const seen = new Set();

  for (let i = 0; i < 100_000; i += 1) {
    seen.add(keyOf(pickCombination(random)));
  }

  assert.deepEqual(
    [...seen].sort(),
    COMBINATIONS.map(keyOf).sort(),
  );
});

test('загрузка всегда состоит из допустимой комбинации', () => {
  const random = mulberry32(99);
  const settings = {
    goldEnabled: true,
    goldChance: 40,
    purpleEnabled: true,
    purpleChance: 40,
  };
  const valid = new Set(COMBINATIONS.map(keyOf));

  for (let i = 0; i < 40_000; i += 1) {
    const bullets = buildLoad(settings, random);
    const counts = countTypes(bullets);

    assert.ok(bullets.length >= 3 && bullets.length <= 7, 'длина загрузки 3–7');
    assert.equal(counts.gold <= 1, true, 'не больше одного золотого');
    assert.equal(counts.purple <= 1, true, 'не больше одного фиолетового');

    const baseBlanks = counts.blank + counts.purple;
    const baseLives = counts.live + counts.gold;
    assert.ok(
      valid.has(`${baseBlanks}:${baseLives}`),
      `недопустимая основа ${baseBlanks}:${baseLives}`,
    );
    assert.equal(counts.blank + counts.live + counts.gold + counts.purple, bullets.length);
  }
});

test('золотой заменяет боевой, не меняя длину загрузки', () => {
  const base = buildLoad({}, mulberry32(42));
  const withGold = buildLoad(
    { goldEnabled: true, goldChance: 100 },
    mulberry32(42),
  );

  assert.equal(withGold.length, base.length);

  const differences = [];
  base.forEach((bullet, index) => {
    if (bullet !== withGold[index]) differences.push([index, bullet, withGold[index]]);
  });

  assert.equal(differences.length, 1);
  assert.equal(differences[0][1], BULLET.LIVE);
  assert.equal(differences[0][2], BULLET.GOLD);
  assert.equal(countTypes(withGold).gold, 1);
});

test('фиолетовый заменяет холостой, не меняя длину загрузки', () => {
  const base = buildLoad({}, mulberry32(43));
  const withPurple = buildLoad(
    { purpleEnabled: true, purpleChance: 100 },
    mulberry32(43),
  );

  assert.equal(withPurple.length, base.length);

  const differences = [];
  base.forEach((bullet, index) => {
    if (bullet !== withPurple[index]) differences.push([index, bullet, withPurple[index]]);
  });

  assert.equal(differences.length, 1);
  assert.equal(differences[0][1], BULLET.BLANK);
  assert.equal(differences[0][2], BULLET.PURPLE);
  assert.equal(countTypes(withPurple).purple, 1);
});

test('оба особых патрона независимы и занимают разные места', () => {
  const base = buildLoad({}, mulberry32(44));
  const special = buildLoad(
    { goldEnabled: true, goldChance: 100, purpleEnabled: true, purpleChance: 100 },
    mulberry32(44),
  );

  assert.equal(special.length, base.length);

  const differences = [];
  base.forEach((bullet, index) => {
    if (bullet !== special[index]) differences.push([index, bullet, special[index]]);
  });

  assert.equal(differences.length, 2);
  assert.notEqual(differences[0][0], differences[1][0]);

  const bySource = new Map(differences.map(([index, from, to]) => [from, to]));
  assert.equal(bySource.get(BULLET.LIVE), BULLET.GOLD);
  assert.equal(bySource.get(BULLET.BLANK), BULLET.PURPLE);
  assert.equal(countTypes(special).gold, 1);
  assert.equal(countTypes(special).purple, 1);
});

test('нулевой шанс оставляет загрузку без особых патронов', () => {
  for (let seed = 1; seed <= 100; seed += 1) {
    const base = buildLoad({}, mulberry32(seed));
    const withZero = buildLoad(
      { goldEnabled: true, goldChance: 0, purpleEnabled: true, purpleChance: 0 },
      mulberry32(seed),
    );
    assert.deepEqual(withZero, base);
  }
});

test('шанс 20% даёт примерно 20% загрузок с патроном', () => {
  const random = mulberry32(2026);
  const iterations = 20_000;
  let goldLoads = 0;
  let purpleLoads = 0;
  let maxGold = 0;
  let maxPurple = 0;

  for (let i = 0; i < iterations; i += 1) {
    const bullets = buildLoad(
      {
        goldEnabled: true,
        goldChance: 20,
        purpleEnabled: true,
        purpleChance: 20,
      },
      random,
    );
    const counts = countTypes(bullets);

    if (counts.gold > 0) goldLoads += 1;
    if (counts.purple > 0) purpleLoads += 1;
    maxGold = Math.max(maxGold, counts.gold);
    maxPurple = Math.max(maxPurple, counts.purple);
  }

  assert.ok(goldLoads / iterations > 0.18 && goldLoads / iterations < 0.22);
  assert.ok(purpleLoads / iterations > 0.18 && purpleLoads / iterations < 0.22);
  assert.equal(maxGold, 1);
  assert.equal(maxPurple, 1);
});

test('выключенные особые патроны не появляются даже при 100%', () => {
  const random = mulberry32(5);
  for (let i = 0; i < 2_000; i += 1) {
    const counts = countTypes(buildLoad(
      { goldEnabled: false, goldChance: 100, purpleEnabled: false, purpleChance: 100 },
      random,
    ));
    assert.equal(counts.gold, 0);
    assert.equal(counts.purple, 0);
  }
});
