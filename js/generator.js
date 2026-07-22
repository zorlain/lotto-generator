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

// 가중치에 비례한 확률로, 중복 없이 k개를 뽑는다. forced에 담긴 번호는 항상 결과에 포함시키고,
// 나머지 자리만 가중치 추첨으로 채운다.
function weightedSampleWithoutReplacement(weights, k, forced) {
  const forcedList = (forced || []).slice(0, k);
  const forcedSet = new Set(forcedList);
  const pool = [];
  for (let n = 1; n <= 45; n++) {
    if (!forcedSet.has(n)) pool.push({ n, w: weights[n] });
  }

  const result = [...forcedList];
  const need = k - result.length;
  for (let i = 0; i < need; i++) {
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

function combinationKey(nums) {
  return nums.join(",");
}

// count개(기본 5개)를 채울 때까지, 지정한 조건을 실제로 전부 만족하는 조합만 인정하며
// 하나의 공유 시도 횟수 예산(TOTAL_ATTEMPT_BUDGET) 안에서 반복 추첨한다.
// 조건이 너무 까다로워서 예산 안에 count개를 못 채우면, 찾은 만큼만(0개일 수도 있음) 반환한다.
// (개별 조합마다 처음부터 다시 예산을 배정하지 않고 전체가 예산을 공유하므로,
//  불가능한 조건이어도 응답 시간이 일정하게 제한된다.)
const TOTAL_ATTEMPT_BUDGET = 60000;

function generateSets(stats, config, count) {
  const weights = computeNumberWeights(stats, config);
  const oddRange = config.oddEven.enabled ? pickOddRange(stats, config) : null;
  const targetSum = config.sumRange.enabled ? pickTargetSumRange(stats, config) : null;
  const zoneTargets = config.zoneSpread.enabled ? config.zoneSpread.zoneTargets : null;
  const acRange = config.acRange.enabled ? pickAcRange(stats, config) : null;
  const maxSameDigit = config.lastDigit.enabled ? config.lastDigit.maxSameDigit : null;
  const consecutiveMode = config.consecutive.enabled ? config.consecutive.mode : "auto";

  const results = [];
  const seen = new Set();

  // forcedForPhase에 담긴 번호를 포함시킨 채로, needCount개를 찾을 때까지(또는 예산 소진까지) 추첨한다.
  function fillPhase(forcedForPhase, needCount, attemptBudget) {
    let produced = 0;
    for (let attempt = 0; attempt < attemptBudget && produced < needCount; attempt++) {
      // 미출현 기간처럼 "자동" 모드가 남아있는 조건은 시도할 때마다 목표를 다시 뽑아,
      // 생성되는 5조합이 서로 다른 목표값을 가질 수 있게 한다.
      const prevRepeatRange = config.prevRepeat.enabled ? pickPrevRepeatRange(stats, config) : null;

      const candidate = weightedSampleWithoutReplacement(weights, 6, forcedForPhase);
      const key = combinationKey(candidate);
      if (seen.has(key)) continue;

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
        seen.add(key);
        results.push({ nums: candidate, odd, sum });
        produced++;
      }
    }
  }

  // "원하는 번호 포함"이 켜져 있으면 모드에 따라 두 가지 방식으로 강제로 넣는다.
  // - "common": 같은 번호 세트를 지정한 줄 수만큼 넣고, 나머지 줄은 자유롭게 생성한다.
  // - "perRow": A~E줄마다 각자 지정한 번호를 넣는다(빈 줄은 자유 생성). 줄 순서가 그대로
  //   결과 배열 순서(=A~E 라벨)와 대응해야 하므로, 줄 단위로 순서대로 하나씩 생성한다.
  const includeCfg = config.includeNumbers;
  const perRowOn = includeCfg.enabled && includeCfg.mode === "perRow" &&
    includeCfg.perRow.some((nums) => nums.length > 0);
  const commonOn = includeCfg.enabled && includeCfg.mode !== "perRow" && includeCfg.numbers.length > 0;

  if (perRowOn) {
    const perRowBudget = Math.floor(TOTAL_ATTEMPT_BUDGET / count);
    for (let i = 0; i < count; i++) {
      fillPhase(includeCfg.perRow[i] || [], 1, perRowBudget);
    }
  } else {
    const forcedRowCount = commonOn
      ? Math.min(count, Math.max(1, includeCfg.rowCount || count))
      : 0;

    if (forcedRowCount > 0) {
      const phase1Budget = Math.round((TOTAL_ATTEMPT_BUDGET * forcedRowCount) / count);
      fillPhase(includeCfg.numbers, forcedRowCount, phase1Budget);
    }

    const remaining = count - results.length;
    if (remaining > 0) {
      const phase2Budget = TOTAL_ATTEMPT_BUDGET - (forcedRowCount > 0 ? Math.round((TOTAL_ATTEMPT_BUDGET * forcedRowCount) / count) : 0);
      fillPhase([], remaining, phase2Budget);
    }
  }

  return results;
}
