// 통계와, 사용자가 탭2에서 직접 지정한 값(config)을 함께 반영해 번호 조합을 생성한다.

function weightedPick(weights) {
  const total = weights.reduce((a, w) => a + w.weight, 0);
  let r = Math.random() * total;
  for (const w of weights) {
    r -= w.weight;
    if (r <= 0) return w.key;
  }
  return weights[weights.length - 1].key;
}

function oddCountOf(nums) {
  return nums.filter((n) => n % 2 === 1).length;
}

function sumOf(nums) {
  return nums.reduce((a, b) => a + b, 0);
}

function zoneCountsOf(nums, zoneRanges) {
  return zoneRanges.map(
    (range) => nums.filter((n) => n >= range[0] && n <= range[1]).length
  );
}

// nums는 오름차순 정렬되어 있다고 가정한다 (weightedSampleWithoutReplacement가 정렬해서 반환).
function maxLastDigitCountOf(nums) {
  const counts = new Array(10).fill(0);
  nums.forEach((n) => counts[n % 10]++);
  return Math.max(...counts);
}

function hasConsecutivePairOf(nums) {
  for (let i = 0; i < nums.length - 1; i++) {
    if (nums[i + 1] - nums[i] === 1) return true;
  }
  return false;
}

// AC값: 6개 번호 사이의 모든 쌍의 차이값 중 서로 다른 값의 개수 - (n-1). 0~10 사이로 자른다.
function acValueOf(nums) {
  const diffs = new Set();
  for (let a = 0; a < nums.length; a++) {
    for (let b = a + 1; b < nums.length; b++) {
      diffs.add(nums[b] - nums[a]);
    }
  }
  return Math.min(10, Math.max(0, diffs.size - (nums.length - 1)));
}

function overlapCountOf(nums, otherNums) {
  const otherSet = new Set(otherNums);
  return nums.filter((n) => otherSet.has(n)).length;
}

const WEIGHT_BOOST = 3; // 우대 대상 번호에 곱해주는 가중치 배수

// 번호(1~45)별 추첨 가중치를 계산한다. 기본은 전부 동일(1)이고,
// "출현 빈도", "미출현 기간", "궁합 번호"에서 지정한 조건에 맞는 번호에 WEIGHT_BOOST배 가중치를 준다.
function computeNumberWeights(stats, config) {
  const w = new Array(46).fill(1);

  if (config.freq.enabled) {
    const ranked = [...stats.numberRanking]; // count 내림차순(HOT -> COLD)
    const pool =
      config.freq.direction === "hot"
        ? ranked.slice(0, config.freq.topN)
        : ranked.slice().reverse().slice(0, config.freq.topN);
    pool.forEach((x) => {
      w[x.n] *= WEIGHT_BOOST;
    });
  }

  if (config.gap.enabled) {
    for (let n = 1; n <= 45; n++) {
      if (stats.gapNow[n] >= config.gap.threshold) {
        w[n] *= WEIGHT_BOOST;
      }
    }
  }

  if (config.coOccurrence.enabled) {
    stats.pairScoreRanking.slice(0, config.coOccurrence.topN).forEach((x) => {
      w[x.n] *= WEIGHT_BOOST;
    });
  }

  return w;
}

// 가중치에 비례한 확률로, 중복 없이 k개를 뽑는다.
function weightedSampleWithoutReplacement(weights, k) {
  const pool = [];
  for (let n = 1; n <= 45; n++) pool.push({ n, w: weights[n] });

  const result = [];
  for (let i = 0; i < k; i++) {
    const total = pool.reduce((a, p) => a + p.w, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (; idx < pool.length; idx++) {
      r -= pool[idx].w;
      if (r <= 0) break;
    }
    if (idx >= pool.length) idx = pool.length - 1;
    result.push(pool[idx].n);
    pool.splice(idx, 1);
  }
  return result.sort((a, b) => a - b);
}

// 홀수 개수의 허용 범위 - 항상 사용자가 슬라이더로 고른 범위를 그대로 쓴다.
function pickOddRange(stats, config) {
  return { min: config.oddEven.manualMin, max: config.oddEven.manualMax };
}

// 번호 합계의 허용 범위 - 항상 사용자가 슬라이더로 고른 범위를 그대로 쓴다.
function pickTargetSumRange(stats, config) {
  return { min: config.sumRange.manualMin, max: config.sumRange.manualMax };
}

// AC값(0~10)의 허용 범위 - 항상 사용자가 슬라이더로 고른 범위를 그대로 쓴다.
function pickAcRange(stats, config) {
  return { min: config.acRange.manualMin, max: config.acRange.manualMax };
}

// 직전 회차(실제 마지막 회차)와 겹치는 번호 개수(0~6)의 허용 범위를 정한다.
function pickPrevRepeatRange(stats, config) {
  if (config.prevRepeat.mode === "manual") {
    return { min: config.prevRepeat.manualMin, max: config.prevRepeat.manualMax };
  }
  const weights = stats.prevDrawRepeatDist.map((count, repeat) => ({
    key: repeat,
    weight: count + 1,
  }));
  const picked = weightedPick(weights);
  return { min: picked, max: picked };
}

function matchesZoneTargets(zones, zoneTargets) {
  for (let i = 0; i < zoneTargets.length; i++) {
    if (zoneTargets[i] !== null && zones[i] !== zoneTargets[i]) return false;
  }
  return true;
}

function generateOneSet(stats, config) {
  const weights = computeNumberWeights(stats, config);
  const oddRange = config.oddEven.enabled ? pickOddRange(stats, config) : null;
  const targetSum = config.sumRange.enabled ? pickTargetSumRange(stats, config) : null;
  const zoneTargets = config.zoneSpread.enabled ? config.zoneSpread.zoneTargets : null;
  const acRange = config.acRange.enabled ? pickAcRange(stats, config) : null;
  const prevRepeatRange = config.prevRepeat.enabled ? pickPrevRepeatRange(stats, config) : null;
  const maxSameDigit = config.lastDigit.enabled ? config.lastDigit.maxSameDigit : null;
  const consecutiveMode = config.consecutive.enabled ? config.consecutive.mode : "auto";

  const maxAttempts = 4000;
  let best = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = weightedSampleWithoutReplacement(weights, 6);
    const odd = oddCountOf(candidate);
    const sum = sumOf(candidate);
    const zones = zoneCountsOf(candidate, stats.zoneRanges);

    if (zoneTargets && !matchesZoneTargets(zones, zoneTargets)) continue;
    if (maxSameDigit !== null && maxLastDigitCountOf(candidate) > maxSameDigit) continue;

    const hasConsec = hasConsecutivePairOf(candidate);
    if (consecutiveMode === "require" && !hasConsec) continue;
    if (consecutiveMode === "exclude" && hasConsec) continue;

    const ac = acValueOf(candidate);
    const prevRepeat = overlapCountOf(candidate, stats.lastDraw.nums);

    const matchesOdd = oddRange === null || (odd >= oddRange.min && odd <= oddRange.max);
    const matchesSum = targetSum === null || (sum >= targetSum.min && sum <= targetSum.max);
    const matchesAc = acRange === null || (ac >= acRange.min && ac <= acRange.max);
    const matchesPrevRepeat =
      prevRepeatRange === null || (prevRepeat >= prevRepeatRange.min && prevRepeat <= prevRepeatRange.max);

    if (matchesOdd && matchesSum && matchesAc && matchesPrevRepeat) {
      return { nums: candidate, odd, sum };
    }
    if (!best && matchesOdd) {
      best = { nums: candidate, odd, sum };
    }
  }

  if (best) return best;

  const fallback = weightedSampleWithoutReplacement(weights, 6);
  return { nums: fallback, odd: oddCountOf(fallback), sum: sumOf(fallback) };
}

function combinationKey(nums) {
  return nums.join(",");
}

function generateSets(stats, config, count) {
  const results = [];
  const seen = new Set();
  let guard = 0;

  while (results.length < count && guard < count * 50) {
    guard++;
    const set = generateOneSet(stats, config);
    const key = combinationKey(set.nums);
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(set);
  }

  return results;
}
