/* ============================================================
   연금복권 번호 생성기 — 로또 사이트에 병합된 번들
   (기존 pension-lotto-generator의 config+stats+generator+app+export를
   하나의 IIFE로 감싸서 로또 쪽 전역 함수/변수와 이름이 겹치지 않게 했다.)
   ============================================================ */
(function () {
// 탭2("맞춤 설정")에서 사용자가 켜고 끄고, 직접 값으로 지정하는 생성 설정.
const CONFIG_STORAGE_KEY = "pension-gen-config-v2";
const DIGIT_POSITIONS = 6; // 6자리 숫자

function defaultConfig() {
  return {
    // mode: "common"(5줄 공통 적용) | "perRow"(A~E줄마다 따로 지정)
    // value: mode가 common일 때 쓸 값 — "auto"(무작위) | "1".."5"(해당 조로 고정)
    // perRow[i]: mode가 perRow일 때 i번째 줄(A~E)에 쓸 값 — "auto" | "1".."5"
    group: { mode: "common", value: "auto", perRow: ["auto", "auto", "auto", "auto", "auto"] },
    sumRange: { enabled: true, manualMin: 15, manualMax: 35 },
    // positions[i]: i번째 자리(0~5)에 고정할 숫자(0~9). null이면 자동.
    includeDigits: { enabled: false, positions: [null, null, null, null, null, null] },
    oddDigit: { enabled: false, manualMin: 2, manualMax: 4 },
    // 아래는 전부 "심화 설정" — 초기값은 모두 꺼짐(체크 해제) 상태로 시작한다.
    digitFreq: { enabled: false, direction: "hot" },
    gapDigit: { enabled: false, threshold: 15 },
    // 6자리 중 같은 숫자가 몇 개까지 겹쳐도 되는지(0~5).
    duplicateDigit: { enabled: false, manualMin: 0, manualMax: 3 },
    prevRepeat: { enabled: false, maxOverlap: 2 },
  };
}

function loadConfig() {
  const base = defaultConfig();
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw);
    for (const key of Object.keys(base)) {
      if (saved[key]) Object.assign(base[key], saved[key]);
    }
    return base;
  } catch (e) {
    return base;
  }
}

function saveConfig(config) {
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
}

// 연금복권720+ 전 회차 데이터를 분석해 통계를 계산한다.
const PENSION_PRIME_DIGITS = new Set([2, 3, 5, 7]);
const PENSION_SEASON_NAMES = ["겨울", "봄", "여름", "가을"];

function digitsOf(numStr) {
  return numStr.split("").map(Number);
}

function pensionSeasonOfMonth(month) {
  if (month === 12 || month === 1 || month === 2) return 0;
  if (month >= 3 && month <= 5) return 1;
  if (month >= 6 && month <= 8) return 2;
  return 3;
}

function computeStats(data) {
  const total = data.length;

  const groupFreq = [0, 0, 0, 0, 0, 0]; // index 1~5 사용
  const digitFreq = Array.from({ length: DIGIT_POSITIONS }, () => new Array(10).fill(0));
  const bonusDigitFreq = Array.from({ length: DIGIT_POSITIONS }, () => new Array(10).fill(0));
  const sumCounts = new Array(55).fill(0); // 자릿수 합계 0~54
  const oddCountDist = new Array(7).fill(0); // 홀수 자릿수 개수 0~6
  const duplicateDigitDist = new Array(6).fill(0); // 한 회차 안에서 중복되는 자릿수 개수 0~5
  const prevDrawRepeatDist = new Array(7).fill(0); // 직전 회차와 같은 자리에서 일치하는 개수 0~6
  const primeDigitCountDist = new Array(7).fill(0); // 소수 자릿수(2,3,5,7) 개수 0~6
  const multiple3DigitDist = new Array(7).fill(0); // 3의 배수 자릿수(0,3,6,9) 개수 0~6
  const multiple5DigitDist = new Array(7).fill(0); // 5의 배수 자릿수(0,5) 개수 0~6
  const ascendStreakDist = { none: 0, two: 0, threePlus: 0 }; // 자릿수 사이 최장 연속(오름차순) 길이
  const repeatStreakDist = { none: 0, two: 0, threePlus: 0 }; // 동일 숫자 연속 반복 최장 길이 (예: 77, 777)
  const digitLastSeenIndex = Array.from({ length: DIGIT_POSITIONS }, () => new Array(10).fill(-1));
  const reappearIntervals = [];
  const seasonGroupFreq = [
    [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0],
  ];
  const numSeen = new Set();
  let hasExactRepeat = false;
  let sumOfSums = 0;

  data.forEach((d, idx) => {
    groupFreq[d.group]++;

    const digits = digitsOf(d.num);
    let sum = 0;
    let oddCount = 0;
    let primeCount = 0;
    let multiple3Count = 0;
    let multiple5Count = 0;
    digits.forEach((digit, pos) => {
      digitFreq[pos][digit]++;
      sum += digit;
      if (digit % 2 === 1) oddCount++;
      if (PENSION_PRIME_DIGITS.has(digit)) primeCount++;
      if (digit % 3 === 0) multiple3Count++;
      if (digit % 5 === 0) multiple5Count++;
    });
    sumCounts[sum]++;
    sumOfSums += sum;
    oddCountDist[oddCount]++;
    primeDigitCountDist[primeCount]++;
    multiple3DigitDist[multiple3Count]++;
    multiple5DigitDist[multiple5Count]++;

    let curAscend = 1;
    let maxAscend = 1;
    let curRepeat = 1;
    let maxRepeat = 1;
    for (let pos = 0; pos < digits.length - 1; pos++) {
      if (digits[pos + 1] - digits[pos] === 1) {
        curAscend++;
        if (curAscend > maxAscend) maxAscend = curAscend;
      } else {
        curAscend = 1;
      }
      if (digits[pos + 1] === digits[pos]) {
        curRepeat++;
        if (curRepeat > maxRepeat) maxRepeat = curRepeat;
      } else {
        curRepeat = 1;
      }
    }
    if (maxAscend === 1) ascendStreakDist.none++;
    else if (maxAscend === 2) ascendStreakDist.two++;
    else ascendStreakDist.threePlus++;

    if (maxRepeat === 1) repeatStreakDist.none++;
    else if (maxRepeat === 2) repeatStreakDist.two++;
    else repeatStreakDist.threePlus++;

    digits.forEach((digit, pos) => {
      const seenAt = digitLastSeenIndex[pos][digit];
      if (seenAt !== -1) reappearIntervals.push(idx - seenAt);
      digitLastSeenIndex[pos][digit] = idx;
    });

    if (numSeen.has(d.num)) hasExactRepeat = true;
    numSeen.add(d.num);

    if (d.date) {
      const month = Number(d.date.split("-")[1]);
      const season = pensionSeasonOfMonth(month);
      seasonGroupFreq[season][d.group]++;
    }

    const uniqueDigitCount = new Set(digits).size;
    duplicateDigitDist[6 - uniqueDigitCount]++;

    if (idx > 0) {
      const prevDigits = digitsOf(data[idx - 1].num);
      let matched = 0;
      for (let pos = 0; pos < DIGIT_POSITIONS; pos++) {
        if (digits[pos] === prevDigits[pos]) matched++;
      }
      prevDrawRepeatDist[matched]++;
    }

    digitsOf(d.bonus).forEach((digit, pos) => bonusDigitFreq[pos][digit]++);
  });

  const avgSum = sumOfSums / total;
  const sumVariance = data.reduce((a, d) => {
    const s = digitsOf(d.num).reduce((x, y) => x + y, 0);
    return a + (s - avgSum) ** 2;
  }, 0) / total;
  const sumStdDev = Math.sqrt(sumVariance);

  const seasonalGroupRanking = PENSION_SEASON_NAMES.map((name, si) => ({
    season: name,
    ranking: [1, 2, 3, 4, 5]
      .map((g) => ({ group: g, count: seasonGroupFreq[si][g] }))
      .sort((a, b) => b.count - a.count),
  }));

  // 재출현 간격(같은 자리에 같은 숫자가 다시 나오기까지 걸린 회차) 히스토그램
  const gapBinWidth = 5;
  const maxInterval = reappearIntervals.length ? Math.max(...reappearIntervals) : 0;
  const gapBinEnd = Math.ceil((maxInterval + 1) / gapBinWidth) * gapBinWidth;
  const gapHistogram = [];
  for (let b = 0; b < gapBinEnd; b += gapBinWidth) {
    gapHistogram.push({ min: b + 1, max: b + gapBinWidth, count: 0 });
  }
  for (const interval of reappearIntervals) {
    const idx = Math.floor((interval - 1) / gapBinWidth);
    gapHistogram[idx].count++;
  }

  // 자릿수 합계 구간을 5단위로 묶어서 히스토그램 bin을 만든다.
  const sumBins = [];
  for (let start = 0; start <= 50; start += 5) {
    const end = Math.min(start + 4, 54);
    let count = 0;
    for (let s = start; s <= end; s++) count += sumCounts[s];
    sumBins.push({ min: start, max: end, count });
  }

  // digitGapNow[pos][digit]: 그 자리에 그 숫자가 마지막으로 나온 뒤 몇 회차가 지났는지(0이면 바로 최근 회차).
  // 한 번도 안 나온 숫자는 total로 취급한다.
  const digitGapNow = Array.from({ length: DIGIT_POSITIONS }, () => new Array(10).fill(total));
  const lastSeenIndex = Array.from({ length: DIGIT_POSITIONS }, () => new Array(10).fill(-1));
  data.forEach((d, idx) => {
    digitsOf(d.num).forEach((digit, pos) => { lastSeenIndex[pos][digit] = idx; });
  });
  for (let pos = 0; pos < DIGIT_POSITIONS; pos++) {
    for (let digit = 0; digit <= 9; digit++) {
      const seenAt = lastSeenIndex[pos][digit];
      if (seenAt !== -1) digitGapNow[pos][digit] = total - 1 - seenAt;
    }
  }

  const hotDigitPerPosition = digitFreq.map((freqs) => {
    let maxIdx = 0;
    freqs.forEach((c, i) => { if (c > freqs[maxIdx]) maxIdx = i; });
    return maxIdx;
  });

  const groupRanking = [1, 2, 3, 4, 5]
    .map((g) => ({ group: g, count: groupFreq[g] }))
    .sort((a, b) => b.count - a.count);

  const recentWindow = Math.min(50, total);
  const recentData = data.slice(-recentWindow);
  const recentGroupFreq = [0, 0, 0, 0, 0, 0];
  recentData.forEach((d) => recentGroupFreq[d.group]++);
  const recentGroupRanking = [1, 2, 3, 4, 5]
    .map((g) => ({ group: g, count: recentGroupFreq[g] }))
    .sort((a, b) => b.count - a.count);

  const lastDraw = data[data.length - 1];

  return {
    totalDraws: total,
    lastDraw,
    groupFreq,
    groupRanking,
    digitFreq,
    hotDigitPerPosition,
    digitGapNow,
    bonusDigitFreq,
    sumBins,
    oddCountDist,
    duplicateDigitDist,
    prevDrawRepeatDist,
    recentWindow,
    recentGroupRanking,
    avgSum,
    sumStdDev,
    primeDigitCountDist,
    multiple3DigitDist,
    multiple5DigitDist,
    ascendStreakDist,
    repeatStreakDist,
    seasonalGroupRanking,
    hasExactRepeat,
    gapHistogram,
  };
}

// 통계와, 사용자가 탭2에서 직접 지정한 값(config)을 함께 반영해 연금복권 번호를 생성한다.
// 로또 6/45와 달리 자리마다 숫자가 독립적이고 중복도 허용되므로(예: 000000도 가능),
// "6개 중 distinct 선택" 같은 제약 없이 자리별로 각각 뽑으면 된다.

const WEIGHT_BOOST = 3; // 우대 대상 숫자에 곱해주는 가중치 배수
const TOTAL_ATTEMPT_BUDGET = 20000;

// 자리(0~5)별 숫자(0~9) 가중치를 계산한다. 기본은 전부 동일(1)이고,
// "자릿수별 누적 출현 빈도 가중치"가 켜져 있으면 자리마다 HOT/COLD 상위 3개 숫자에,
// "자릿수별 최근 미출현 가중치"가 켜져 있으면 자리마다 최근 오래 안 나온 숫자에 가중치를 준다.
function computeDigitWeights(stats, config) {
  const weights = Array.from({ length: DIGIT_POSITIONS }, () => new Array(10).fill(1));

  if (config.digitFreq.enabled) {
    for (let pos = 0; pos < DIGIT_POSITIONS; pos++) {
      const ranked = stats.digitFreq[pos]
        .map((count, digit) => ({ digit, count }))
        .sort((a, b) => b.count - a.count);
      const pool = config.digitFreq.direction === "hot" ? ranked.slice(0, 3) : ranked.slice().reverse().slice(0, 3);
      pool.forEach((x) => { weights[pos][x.digit] *= WEIGHT_BOOST; });
    }
  }

  if (config.gapDigit.enabled) {
    for (let pos = 0; pos < DIGIT_POSITIONS; pos++) {
      for (let digit = 0; digit <= 9; digit++) {
        if (stats.digitGapNow[pos][digit] >= config.gapDigit.threshold) {
          weights[pos][digit] *= WEIGHT_BOOST;
        }
      }
    }
  }

  return weights;
}

function uniqueDigitCountOf(digits) {
  return new Set(digits).size;
}

function weightedDigit(digitWeights) {
  const total = digitWeights.reduce((a, w) => a + w, 0);
  let r = Math.random() * total;
  for (let d = 0; d < digitWeights.length; d++) {
    r -= digitWeights[d];
    if (r <= 0) return d;
  }
  return digitWeights.length - 1;
}

// rowIndex(0~4)는 결과가 A~E 중 몇 번째 줄로 나올지를 뜻한다. "줄마다 다르게 설정" 모드에서
// 줄별로 지정한 조를 그대로 반영하기 위해, 결과를 채우는 순서(results.length)를 그대로 넘겨 쓴다.
function pickGroup(config, rowIndex) {
  const spec = config.group.mode === "perRow" ? config.group.perRow[rowIndex] : config.group.value;
  if (spec === "auto" || spec === undefined) return 1 + Math.floor(Math.random() * 5);
  return Number(spec);
}

function sumOfDigits(digits) {
  return digits.reduce((a, b) => a + b, 0);
}

function oddDigitCountOf(digits) {
  return digits.filter((d) => d % 2 === 1).length;
}

function overlapWithPrev(digits, prevDigits) {
  let count = 0;
  for (let i = 0; i < DIGIT_POSITIONS; i++) {
    if (digits[i] === prevDigits[i]) count++;
  }
  return count;
}

function generateSets(stats, config, count) {
  const weights = computeDigitWeights(stats, config);
  const sumRange = config.sumRange.enabled
    ? { min: config.sumRange.manualMin, max: config.sumRange.manualMax }
    : null;
  const oddRange = config.oddDigit.enabled
    ? { min: config.oddDigit.manualMin, max: config.oddDigit.manualMax }
    : null;
  const maxOverlap = config.prevRepeat.enabled ? config.prevRepeat.maxOverlap : null;
  const duplicateRange = config.duplicateDigit.enabled
    ? { min: config.duplicateDigit.manualMin, max: config.duplicateDigit.manualMax }
    : null;
  const prevDigits = digitsOf(stats.lastDraw.num);
  const forcedPositions = config.includeDigits.enabled ? config.includeDigits.positions : null;

  const results = [];
  const seen = new Set();

  for (let attempt = 0; attempt < TOTAL_ATTEMPT_BUDGET && results.length < count; attempt++) {
    const digits = [];
    for (let pos = 0; pos < DIGIT_POSITIONS; pos++) {
      const forced = forcedPositions ? forcedPositions[pos] : null;
      digits.push(forced !== null && forced !== undefined ? forced : weightedDigit(weights[pos]));
    }

    const numStr = digits.join("");
    if (seen.has(numStr)) continue;

    const sum = sumOfDigits(digits);
    if (sumRange && (sum < sumRange.min || sum > sumRange.max)) continue;

    const odd = oddDigitCountOf(digits);
    if (oddRange && (odd < oddRange.min || odd > oddRange.max)) continue;

    if (maxOverlap !== null && overlapWithPrev(digits, prevDigits) > maxOverlap) continue;

    if (duplicateRange) {
      const duplicates = DIGIT_POSITIONS - uniqueDigitCountOf(digits);
      if (duplicates < duplicateRange.min || duplicates > duplicateRange.max) continue;
    }

    seen.add(numStr);
    results.push({ group: pickGroup(config, results.length), num: numStr, sum, odd });
  }

  return results;
}

const POSITION_LABELS = ["1번째", "2번째", "3번째", "4번째", "5번째", "6번째"];

function makeGroupBadge(group, extraClass) {
  const span = document.createElement("span");
  span.className = `group-badge ${extraClass || ""}`;
  span.textContent = `${group}조`;
  return span;
}

function makeDigitTile(digit, extraClass) {
  const span = document.createElement("span");
  span.className = `digit-tile ${extraClass || ""}`;
  span.textContent = digit;
  return span;
}

function makeGroupMiniItem(group, countLabel) {
  const wrap = document.createElement("div");
  wrap.className = "mini-item";
  wrap.appendChild(makeGroupBadge(group));
  const c = document.createElement("span");
  c.className = "mini-count";
  c.textContent = countLabel;
  wrap.appendChild(c);
  return wrap;
}

/* ---------- 클립보드 복사 ---------- */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch (e2) {
      return false;
    }
  }
}

function flashCopied(btn, tempLabel) {
  if (btn.dataset.flashing) return;
  btn.dataset.flashing = "1";
  const original = btn.textContent;
  btn.textContent = tempLabel;
  btn.classList.add("copied");
  setTimeout(() => {
    btn.textContent = original;
    btn.classList.remove("copied");
    delete btn.dataset.flashing;
  }, 1200);
}

/* ---------- 탭 전환 (연금복권 패널 내부로 범위 한정 — 로또 탭과 분리) ---------- */
function initTabs() {
  const root = document.getElementById("game-pension");
  if (!root) return;
  const buttons = root.querySelectorAll(".tab-btn");
  const panels = root.querySelectorAll(".tab-panel");

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.tab;
      buttons.forEach((b) => b.classList.toggle("active", b === btn));
      panels.forEach((p) => {
        p.hidden = p.dataset.tabPanel !== target;
      });
    });
  });
}

/* ---------- 설명 아이콘 툴팁 (PC 호버 + 모바일 탭) ---------- */
function initInfoTooltips() {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".info-btn");
    document.querySelectorAll(".info-btn.open").forEach((el) => {
      if (el !== btn) el.classList.remove("open");
    });
    if (btn) {
      btn.classList.toggle("open");
      e.stopPropagation();
    }
  });
}

/* ---------- 번호 생성 (탭1, 탭2 공용) ---------- */
const SET_LABELS = ["A", "B", "C", "D", "E"];

function renderSetsInto(containerId, sets) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  sets.forEach((set, i) => {
    const row = document.createElement("div");
    row.className = "set-row";

    const label = document.createElement("div");
    label.className = "set-label";
    label.textContent = SET_LABELS[i] || i + 1;
    row.appendChild(label);

    const balls = document.createElement("div");
    balls.className = "set-balls";
    balls.appendChild(makeGroupBadge(set.group));
    set.num.split("").forEach((d, pos) => balls.appendChild(makeDigitTile(d, `pos-${pos}`)));
    row.appendChild(balls);

    const actions = document.createElement("div");
    actions.className = "set-actions";

    const meta = document.createElement("span");
    meta.className = "set-meta";
    meta.textContent = `홀${set.odd} 짝${6 - set.odd} · 합계 ${set.sum}`;
    actions.appendChild(meta);

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "copy-btn";
    copyBtn.textContent = "📋 복사";
    copyBtn.addEventListener("click", () => {
      copyToClipboard(`${set.group}조 ${set.num}`);
      flashCopied(copyBtn, "✅ 복사됨");
    });
    actions.appendChild(copyBtn);

    row.appendChild(actions);
    container.appendChild(row);
  });
}

const SETS_PER_GENERATE = 5;

function setupGeneratePanel({ btnId, containerId, copyAllBtnId, warningId, stats, config }) {
  const state = { sets: [] };
  const btn = document.getElementById(btnId);
  const copyAllBtn = document.getElementById(copyAllBtnId);
  const warningEl = warningId ? document.getElementById(warningId) : null;

  const doGenerate = () => {
    state.sets = generateSets(stats, config, SETS_PER_GENERATE);
    renderSetsInto(containerId, state.sets);

    if (warningEl) {
      if (state.sets.length < SETS_PER_GENERATE) {
        warningEl.textContent = `⚠️ 설정한 조건이 너무 까다로워서 ${SETS_PER_GENERATE}개 중 ${state.sets.length}개만 생성됐습니다. 필터 조건을 조금 완화해보세요.`;
        warningEl.hidden = false;
      } else {
        warningEl.hidden = true;
      }
    }
  };

  btn.addEventListener("click", doGenerate);
  copyAllBtn.addEventListener("click", () => {
    if (!state.sets.length) return;
    const text = state.sets
      .map((set, i) => `${SET_LABELS[i] || i + 1}: ${set.group}조 ${set.num}`)
      .join("\n");
    copyToClipboard(text);
    flashCopied(copyAllBtn, "✅ 전체 복사 완료");
  });

  return doGenerate;
}

/* ---------- 탭 2: 심화 설정 펼치기/접기 ---------- */
function initAdvancedToggle() {
  const toggleBtn = document.getElementById("pension-advanced-toggle");
  const section = document.getElementById("pension-advanced-section");

  toggleBtn.addEventListener("click", () => {
    const willShow = section.hidden;
    section.hidden = !willShow;
    toggleBtn.textContent = willShow
      ? "🔬 심화 설정 접기"
      : "🔬 심화 설정 펼쳐보기 (3개)";
  });
}

function renderActiveConfigSummary(config) {
  const active = [];

  if (config.group.mode === "perRow") {
    const specified = config.group.perRow.filter((v) => v !== "auto").length;
    if (specified > 0) active.push(`조 지정(줄마다 다르게, ${specified}줄)`);
  } else if (config.group.value !== "auto") {
    active.push(`${config.group.value}조 고정`);
  }
  if (config.sumRange.enabled) {
    active.push(`합계 ${config.sumRange.manualMin}~${config.sumRange.manualMax}`);
  }
  if (config.includeDigits.enabled) {
    const template = config.includeDigits.positions.map((v) => (v === null ? "_" : v)).join("");
    if (template !== "______") active.push(`${template} 자리 고정`);
  }
  if (config.digitFreq.enabled) {
    active.push(`자리별 ${config.digitFreq.direction === "hot" ? "HOT" : "COLD"} 숫자 우대`);
  }
  if (config.gapDigit.enabled) active.push(`${config.gapDigit.threshold}회+ 미출현 숫자 우대`);
  if (config.duplicateDigit.enabled) {
    active.push(`중복 ${config.duplicateDigit.manualMin}~${config.duplicateDigit.manualMax}개`);
  }
  if (config.oddDigit.enabled) {
    active.push(`홀수 ${config.oddDigit.manualMin}~${config.oddDigit.manualMax}개`);
  }
  if (config.prevRepeat.enabled) {
    active.push(`직전회차 일치 최대${config.prevRepeat.maxOverlap}개`);
  }

  const el = document.getElementById("pension-active-config-summary");
  el.textContent = active.length ? active.join(" · ") : "완전 무작위 (모든 조건 미반영)";
}

// 두 개의 <input type="range">를 겹쳐서 최소~최대 범위를 고르는 슬라이더로 동작시킨다.
function bindDualSlider({ minEl, maxEl, fillEl, labelEl, format, getRange, setRange, onChange }) {
  const bounds = { min: Number(minEl.min), max: Number(minEl.max) };

  const render = () => {
    const { min, max } = getRange();
    minEl.value = min;
    maxEl.value = max;
    const span = bounds.max - bounds.min || 1;
    const pctA = ((min - bounds.min) / span) * 100;
    const pctB = ((max - bounds.min) / span) * 100;
    fillEl.style.left = `${pctA}%`;
    fillEl.style.width = `${pctB - pctA}%`;
    labelEl.textContent = format(min, max);
  };

  minEl.addEventListener("input", () => {
    let a = Number(minEl.value);
    const { max } = getRange();
    if (a > max) a = max;
    setRange(a, max);
    render();
    onChange();
  });
  maxEl.addEventListener("input", () => {
    let b = Number(maxEl.value);
    const { min } = getRange();
    if (b < min) b = min;
    setRange(min, b);
    render();
    onChange();
  });

  render();
  return render;
}

/* ---------- 탭 2: 맞춤 설정 ---------- */
function initConfigPanel(stats, config, onChange) {
  const resyncFns = [];

  // 조 선택 (공통 적용 / 줄마다 다르게 설정)
  const groupModeRadios = document.querySelectorAll('input[name="pension-opt-group-mode"]');
  const groupCommonRow = document.getElementById("pension-opt-group-common-row");
  const groupCommonSelect = document.getElementById("pension-opt-group-common-select");
  const groupPerRowGrid = document.getElementById("pension-opt-group-perrow-grid");
  const groupPerRowSelects = [];

  const groupOptionsHtml = () => {
    let html = '<option value="auto">자동</option>';
    for (let g = 1; g <= 5; g++) html += `<option value="${g}">${g}조</option>`;
    return html;
  };

  SET_LABELS.forEach((label, i) => {
    const field = document.createElement("div");
    field.className = "digit-position-field";

    const labelEl = document.createElement("label");
    labelEl.textContent = `${label}줄`;

    const select = document.createElement("select");
    select.dataset.row = String(i);
    select.innerHTML = groupOptionsHtml();

    field.appendChild(labelEl);
    field.appendChild(select);
    groupPerRowGrid.appendChild(field);
    groupPerRowSelects.push(select);
  });

  const syncGroup = () => {
    const isPerRow = config.group.mode === "perRow";
    groupCommonRow.hidden = isPerRow;
    groupPerRowGrid.hidden = !isPerRow;
  };

  const resyncGroup = () => {
    groupModeRadios.forEach((radio) => {
      radio.checked = radio.value === config.group.mode;
    });
    groupCommonSelect.value = config.group.value;
    groupPerRowSelects.forEach((select, i) => {
      select.value = config.group.perRow[i];
    });
    syncGroup();
  };
  resyncGroup();
  resyncFns.push(resyncGroup);

  groupModeRadios.forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      config.group.mode = radio.value;
      syncGroup();
      onChange();
    });
  });
  groupCommonSelect.addEventListener("change", () => {
    config.group.value = groupCommonSelect.value;
    onChange();
  });
  groupPerRowSelects.forEach((select) => {
    select.addEventListener("change", () => {
      const i = Number(select.dataset.row);
      config.group.perRow[i] = select.value;
      onChange();
    });
  });

  // 자릿수 합계 구간
  const sumEnabled = document.getElementById("pension-opt-sumrange-enabled");
  const sumManualWrap = document.getElementById("pension-opt-sumrange-manual-wrap");

  const renderSumSlider = bindDualSlider({
    minEl: document.getElementById("pension-opt-sumrange-min"),
    maxEl: document.getElementById("pension-opt-sumrange-max"),
    fillEl: document.getElementById("pension-opt-sumrange-fill"),
    labelEl: document.getElementById("pension-opt-sumrange-labels"),
    format: (a, b) => `합계 ${a} ~ ${b}`,
    getRange: () => ({ min: config.sumRange.manualMin, max: config.sumRange.manualMax }),
    setRange: (a, b) => {
      config.sumRange.manualMin = a;
      config.sumRange.manualMax = b;
    },
    onChange,
  });

  const syncSumRange = () => {
    sumManualWrap.classList.toggle("disabled-field", !config.sumRange.enabled);
  };
  const resyncSumRange = () => {
    sumEnabled.checked = config.sumRange.enabled;
    renderSumSlider();
    syncSumRange();
  };
  resyncSumRange();
  resyncFns.push(resyncSumRange);

  sumEnabled.addEventListener("change", () => {
    config.sumRange.enabled = sumEnabled.checked;
    syncSumRange();
    onChange();
  });

  // 원하는 숫자 포함 (자리별 고정)
  const includeEnabled = document.getElementById("pension-opt-include-enabled");
  const includeGrid = document.getElementById("pension-opt-include-grid");
  const includeHint = document.getElementById("pension-opt-include-hint");
  const includeSelects = [];

  POSITION_LABELS.forEach((label, pos) => {
    const field = document.createElement("div");
    field.className = "digit-position-field";

    const labelEl = document.createElement("label");
    labelEl.textContent = label;

    const select = document.createElement("select");
    select.dataset.pos = String(pos);
    const autoOpt = document.createElement("option");
    autoOpt.value = "auto";
    autoOpt.textContent = "자동";
    select.appendChild(autoOpt);
    for (let d = 0; d <= 9; d++) {
      const opt = document.createElement("option");
      opt.value = String(d);
      opt.textContent = String(d);
      select.appendChild(opt);
    }

    field.appendChild(labelEl);
    field.appendChild(select);
    includeGrid.appendChild(field);
    includeSelects.push(select);
  });

  const syncInclude = () => {
    includeSelects.forEach((s) => (s.disabled = !config.includeDigits.enabled));
    const picked = config.includeDigits.positions
      .map((v, i) => (v === null ? null : `${POSITION_LABELS[i]} 자리 = ${v}`))
      .filter(Boolean);
    if (!config.includeDigits.enabled) {
      includeHint.textContent = "";
    } else if (picked.length === 0) {
      includeHint.textContent = "지정한 자리가 없습니다.";
    } else {
      includeHint.textContent = picked.join(" · ");
    }
  };

  const resyncInclude = () => {
    includeEnabled.checked = config.includeDigits.enabled;
    includeSelects.forEach((select, pos) => {
      const v = config.includeDigits.positions[pos];
      select.value = v === null ? "auto" : String(v);
    });
    syncInclude();
  };
  resyncInclude();
  resyncFns.push(resyncInclude);

  includeEnabled.addEventListener("change", () => {
    config.includeDigits.enabled = includeEnabled.checked;
    syncInclude();
    onChange();
  });
  includeSelects.forEach((select) => {
    select.addEventListener("change", () => {
      const pos = Number(select.dataset.pos);
      config.includeDigits.positions[pos] = select.value === "auto" ? null : Number(select.value);
      syncInclude();
      onChange();
    });
  });

  // 자릿수별 누적 출현 빈도 가중치
  const digitFreqEnabled = document.getElementById("pension-opt-digitfreq-enabled");
  const digitFreqRadios = document.querySelectorAll('input[name="pension-opt-digitfreq-direction"]');

  const syncDigitFreq = () => {
    digitFreqRadios.forEach((r) => (r.disabled = !config.digitFreq.enabled));
  };
  const resyncDigitFreq = () => {
    digitFreqEnabled.checked = config.digitFreq.enabled;
    digitFreqRadios.forEach((radio) => {
      radio.checked = radio.value === config.digitFreq.direction;
    });
    syncDigitFreq();
  };
  resyncDigitFreq();
  resyncFns.push(resyncDigitFreq);

  digitFreqEnabled.addEventListener("change", () => {
    config.digitFreq.enabled = digitFreqEnabled.checked;
    syncDigitFreq();
    onChange();
  });
  digitFreqRadios.forEach((radio) => {
    radio.addEventListener("change", () => {
      if (radio.checked) {
        config.digitFreq.direction = radio.value;
        onChange();
      }
    });
  });

  // 자릿수별 최근 미출현 가중치
  const gapDigitEnabled = document.getElementById("pension-opt-gapdigit-enabled");
  const gapDigitThreshold = document.getElementById("pension-opt-gapdigit-threshold");

  const syncGapDigit = () => {
    gapDigitThreshold.disabled = !config.gapDigit.enabled;
  };
  const resyncGapDigit = () => {
    gapDigitEnabled.checked = config.gapDigit.enabled;
    gapDigitThreshold.value = config.gapDigit.threshold;
    syncGapDigit();
  };
  resyncGapDigit();
  resyncFns.push(resyncGapDigit);

  gapDigitEnabled.addEventListener("change", () => {
    config.gapDigit.enabled = gapDigitEnabled.checked;
    syncGapDigit();
    onChange();
  });
  gapDigitThreshold.addEventListener("input", () => {
    config.gapDigit.threshold = Math.max(1, Number(gapDigitThreshold.value) || 1);
    onChange();
  });

  // 자릿수 중복 개수 제한
  const duplicateEnabled = document.getElementById("pension-opt-duplicatedigit-enabled");
  const duplicateManualWrap = document.getElementById("pension-opt-duplicatedigit-manual-wrap");

  const renderDuplicateSlider = bindDualSlider({
    minEl: document.getElementById("pension-opt-duplicatedigit-min"),
    maxEl: document.getElementById("pension-opt-duplicatedigit-max"),
    fillEl: document.getElementById("pension-opt-duplicatedigit-fill"),
    labelEl: document.getElementById("pension-opt-duplicatedigit-labels"),
    format: (a, b) => (a === b ? `중복 ${a}개` : `중복 ${a}~${b}개`),
    getRange: () => ({ min: config.duplicateDigit.manualMin, max: config.duplicateDigit.manualMax }),
    setRange: (a, b) => {
      config.duplicateDigit.manualMin = a;
      config.duplicateDigit.manualMax = b;
    },
    onChange,
  });

  const syncDuplicate = () => {
    duplicateManualWrap.classList.toggle("disabled-field", !config.duplicateDigit.enabled);
  };
  const resyncDuplicate = () => {
    duplicateEnabled.checked = config.duplicateDigit.enabled;
    renderDuplicateSlider();
    syncDuplicate();
  };
  resyncDuplicate();
  resyncFns.push(resyncDuplicate);

  duplicateEnabled.addEventListener("change", () => {
    config.duplicateDigit.enabled = duplicateEnabled.checked;
    syncDuplicate();
    onChange();
  });

  // 홀수 자릿수 개수
  const oddEnabled = document.getElementById("pension-opt-odddigit-enabled");
  const oddManualWrap = document.getElementById("pension-opt-odddigit-manual-wrap");

  const renderOddSlider = bindDualSlider({
    minEl: document.getElementById("pension-opt-odddigit-min"),
    maxEl: document.getElementById("pension-opt-odddigit-max"),
    fillEl: document.getElementById("pension-opt-odddigit-fill"),
    labelEl: document.getElementById("pension-opt-odddigit-labels"),
    format: (a, b) => (a === b ? `홀수 ${a}개` : `홀수 ${a}~${b}개`),
    getRange: () => ({ min: config.oddDigit.manualMin, max: config.oddDigit.manualMax }),
    setRange: (a, b) => {
      config.oddDigit.manualMin = a;
      config.oddDigit.manualMax = b;
    },
    onChange,
  });

  const syncOdd = () => {
    oddManualWrap.classList.toggle("disabled-field", !config.oddDigit.enabled);
  };
  const resyncOdd = () => {
    oddEnabled.checked = config.oddDigit.enabled;
    renderOddSlider();
    syncOdd();
  };
  resyncOdd();
  resyncFns.push(resyncOdd);

  oddEnabled.addEventListener("change", () => {
    config.oddDigit.enabled = oddEnabled.checked;
    syncOdd();
    onChange();
  });

  // 직전 회차와 자릿수 일치 제한
  const prevRepeatEnabled = document.getElementById("pension-opt-prevrepeat-enabled");
  const prevRepeatMax = document.getElementById("pension-opt-prevrepeat-max");
  document.getElementById("pension-opt-prevrepeat-drawno").textContent = stats.lastDraw.no;

  const syncPrevRepeat = () => {
    prevRepeatMax.disabled = !config.prevRepeat.enabled;
  };
  const resyncPrevRepeat = () => {
    prevRepeatEnabled.checked = config.prevRepeat.enabled;
    prevRepeatMax.value = String(config.prevRepeat.maxOverlap);
    syncPrevRepeat();
  };
  resyncPrevRepeat();
  resyncFns.push(resyncPrevRepeat);

  prevRepeatEnabled.addEventListener("change", () => {
    config.prevRepeat.enabled = prevRepeatEnabled.checked;
    syncPrevRepeat();
    onChange();
  });
  prevRepeatMax.addEventListener("change", () => {
    config.prevRepeat.maxOverlap = Number(prevRepeatMax.value);
    onChange();
  });

  document.getElementById("pension-reset-config-btn").addEventListener("click", () => {
    const fresh = defaultConfig();
    Object.keys(fresh).forEach((key) => Object.assign(config[key], fresh[key]));
    resyncFns.forEach((fn) => fn());
    onChange();
  });
}

/* ---------- 탭 3: 데이터 통계 ---------- */
/* 회차별 당첨번호 조회 — "N회 연금복권 당첨번호" 검색 유입에 대응. 데이터 통계 탭 맨 위에서
   최신 회차를 기본으로 보여주고, 회차를 입력하면 그 회차로 바꿔 보여준다. */
function renderPensionRoundLookup(stats, no) {
  const resultEl = document.getElementById("pension-round-lookup-result");
  const inputEl = document.getElementById("pension-round-lookup-input");
  const targetNo = no || stats.lastDraw.no;
  const draw = PENSION_DATA.find((d) => d.no === targetNo);

  inputEl.value = targetNo;
  resultEl.innerHTML = "";

  if (!draw) {
    const err = document.createElement("p");
    err.className = "round-lookup-error";
    err.textContent = `${targetNo}회는 존재하지 않는 회차입니다. (1~${stats.lastDraw.no}회)`;
    resultEl.appendChild(err);
    return;
  }

  const head = document.createElement("div");
  head.className = "round-lookup-head";
  head.textContent = `${draw.no}회 (${draw.date} 추첨)`;
  resultEl.appendChild(head);

  const row = document.createElement("div");
  row.className = "round-lookup-balls";
  row.appendChild(makeGroupBadge(draw.group));
  draw.num.split("").forEach((d, pos) => row.appendChild(makeDigitTile(d, `pos-${pos}`)));
  resultEl.appendChild(row);

  const bonusRow = document.createElement("div");
  bonusRow.className = "round-lookup-bonus-row";
  const bonusLabel = document.createElement("span");
  bonusLabel.className = "round-lookup-bonus-label";
  bonusLabel.textContent = "보너스";
  bonusRow.appendChild(bonusLabel);
  draw.bonus.split("").forEach((d) => bonusRow.appendChild(makeDigitTile(d, "bonus-tile")));
  resultEl.appendChild(bonusRow);
}

function initPensionRoundLookup(stats) {
  const inputEl = document.getElementById("pension-round-lookup-input");
  const btnEl = document.getElementById("pension-round-lookup-btn");
  inputEl.max = stats.lastDraw.no;

  const doLookup = () => {
    const no = parseInt(inputEl.value, 10);
    renderPensionRoundLookup(stats, Number.isFinite(no) ? no : null);
  };

  btnEl.addEventListener("click", doLookup);
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doLookup();
  });

  renderPensionRoundLookup(stats, null);
}

function renderTrustLine(stats) {
  document.getElementById("pension-stats-trust-line").textContent =
    `1회 ~ ${stats.lastDraw.no}회 (${stats.lastDraw.date}) · 총 ${stats.totalDraws.toLocaleString()}개 회차 전수 분석`;
}

function renderGroupFreqChart(stats) {
  const container = document.getElementById("pension-group-freq-chart");
  container.innerHTML = "";
  const max = Math.max(...stats.groupFreq.slice(1));
  const min = Math.min(...stats.groupFreq.slice(1));

  for (let g = 1; g <= 5; g++) {
    const col = document.createElement("div");
    col.className = "freq-col";

    const bar = document.createElement("div");
    bar.className = "freq-bar";
    if (stats.groupFreq[g] === max) bar.classList.add("freq-hot");
    if (stats.groupFreq[g] === min) bar.classList.add("freq-cold");
    const pct = (stats.groupFreq[g] / max) * 100;
    bar.style.height = `${Math.max(pct, 3)}%`;
    bar.title = `${g}조: ${stats.groupFreq[g]}회 출현`;

    const countLabel = document.createElement("div");
    countLabel.className = "freq-count";
    countLabel.textContent = stats.groupFreq[g];

    const numLabel = document.createElement("div");
    numLabel.className = "freq-num";
    numLabel.textContent = `${g}조`;

    col.appendChild(countLabel);
    col.appendChild(bar);
    col.appendChild(numLabel);
    container.appendChild(col);
  }
}

// 자리(0~5)별 숫자(0~9) 출현 횟수를 히트맵 형태로 그린다. 각 자리에서 가장 많이 나온 숫자에 강조 표시한다.
function renderDigitHeatmap(containerId, digitFreqArray) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  digitFreqArray.forEach((freqs, pos) => {
    const row = document.createElement("div");
    row.className = "digit-heatmap-row";

    const label = document.createElement("div");
    label.className = "digit-heatmap-label";
    label.textContent = `${POSITION_LABELS[pos]} 자리`;

    const cells = document.createElement("div");
    cells.className = "digit-heatmap-cells";

    const max = Math.max(...freqs);
    freqs.forEach((count, digit) => {
      const cell = document.createElement("div");
      cell.className = "digit-heatmap-cell";
      if (count === max) cell.classList.add("hot");

      const digitEl = document.createElement("span");
      digitEl.className = "digit-heatmap-cell-digit";
      digitEl.textContent = digit;

      const countEl = document.createElement("span");
      countEl.className = "digit-heatmap-cell-count";
      countEl.textContent = `${count}회`;

      cell.appendChild(digitEl);
      cell.appendChild(countEl);
      cells.appendChild(cell);
    });

    row.appendChild(label);
    row.appendChild(cells);
    container.appendChild(row);
  });
}

// {min, max, count} 구간 목록을 세로 막대 히스토그램으로 그린다.
function renderBinBarChart(containerId, bins) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  const max = Math.max(...bins.map((b) => b.count));
  const total = bins.reduce((a, b) => a + b.count, 0);

  bins.forEach((bin) => {
    const col = document.createElement("div");
    col.className = "sum-col";

    const count = document.createElement("div");
    count.className = "sum-count";
    count.textContent = bin.count;

    const pctLabel = document.createElement("div");
    pctLabel.className = "sum-pct";
    pctLabel.textContent = `${((bin.count / total) * 100).toFixed(1)}%`;

    const bar = document.createElement("div");
    bar.className = "sum-bar";
    if (bin.count === max) bar.classList.add("sum-peak");
    const pct = (bin.count / max) * 100;
    bar.style.height = `${Math.max(pct, 2)}%`;
    bar.title = `${bin.min}~${bin.max}: ${bin.count}회 (${((bin.count / total) * 100).toFixed(1)}%)`;

    const label = document.createElement("div");
    label.className = "sum-label";
    label.textContent = `${bin.min}`;

    col.appendChild(count);
    col.appendChild(pctLabel);
    col.appendChild(bar);
    col.appendChild(label);
    container.appendChild(col);
  });
}

// 개수 배열(counts[i] = i에 해당하는 값의 발생 횟수)을 가로 막대 목록으로 그린다.
function renderHBarDist(containerId, counts, labelFn) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  const max = Math.max(...counts);
  const total = counts.reduce((a, b) => a + b, 0);

  counts.forEach((count, i) => {
    const row = document.createElement("div");
    row.className = "hbar-row";

    const label = document.createElement("div");
    label.className = "hbar-label";
    label.textContent = labelFn(i);

    const track = document.createElement("div");
    track.className = "hbar-track";
    const bar = document.createElement("div");
    bar.className = "hbar-fill";
    const pct = (count / max) * 100;
    bar.style.width = `${Math.max(pct, 2)}%`;
    track.appendChild(bar);

    const value = document.createElement("div");
    value.className = "hbar-value";
    const pctOfTotal = ((count / total) * 100).toFixed(1);
    value.textContent = `${count}회 (${pctOfTotal}%)`;

    row.appendChild(label);
    row.appendChild(track);
    row.appendChild(value);
    container.appendChild(row);
  });
}

function renderSumChart(stats) {
  renderBinBarChart("pension-sum-chart", stats.sumBins);
}

function renderOddDigitChart(stats) {
  renderHBarDist("pension-odd-digit-chart", stats.oddCountDist, (i) => `홀${i}개`);
}

function renderDuplicateDigitChart(stats) {
  renderHBarDist("pension-duplicate-digit-chart", stats.duplicateDigitDist, (i) => (i === 0 ? "전부 다름" : `중복 ${i}개`));
}

function renderPrevRepeatChart(stats) {
  renderHBarDist("pension-prevrepeat-chart", stats.prevDrawRepeatDist, (i) => `${i}자리 일치`);
}

function renderTrendComparison(stats) {
  document.getElementById("pension-trend-desc").textContent =
    `최근 ${stats.recentWindow}회와 전체 ${stats.totalDraws.toLocaleString()}회 기준 조 출현 순위를 비교합니다.`;
  document.getElementById("pension-trend-recent-title").textContent = `최근 ${stats.recentWindow}회 조 순위`;

  const allList = document.getElementById("pension-trend-all-list");
  const recentList = document.getElementById("pension-trend-recent-list");
  allList.innerHTML = "";
  recentList.innerHTML = "";
  stats.groupRanking.forEach((x) => allList.appendChild(makeGroupMiniItem(x.group, `${x.count}회`)));
  stats.recentGroupRanking.forEach((x) => recentList.appendChild(makeGroupMiniItem(x.group, `${x.count}회`)));
}

function renderSumStdDev(stats) {
  document.getElementById("pension-sum-stddev-stat").textContent =
    `평균 합계 ${stats.avgSum.toFixed(1)} · 표준편차 ${stats.sumStdDev.toFixed(1)} (숫자가 작을수록 합계가 평균 근처에 몰려있다는 뜻)`;
}

function renderPrimeMultipleCharts(stats) {
  renderHBarDist("pension-prime-digit-chart", stats.primeDigitCountDist, (i) => `소수 ${i}개`);
  renderHBarDist("pension-multiple3-digit-chart", stats.multiple3DigitDist, (i) => `${i}개`);
  renderHBarDist("pension-multiple5-digit-chart", stats.multiple5DigitDist, (i) => `${i}개`);
}

function renderStreakCharts(stats) {
  document.getElementById("pension-exact-repeat-stat").textContent = stats.hasExactRepeat
    ? "전 회차 중 완전히 동일한 6자리 번호가 나온 적이 있습니다."
    : "전 회차 중 완전히 동일한 6자리 번호가 나온 적은 없습니다.";

  const ascendCounts = [stats.ascendStreakDist.none, stats.ascendStreakDist.two, stats.ascendStreakDist.threePlus];
  renderHBarDist("pension-ascend-streak-chart", ascendCounts, (i) => ["연속 없음", "2연속", "3연속 이상"][i]);

  const repeatCounts = [stats.repeatStreakDist.none, stats.repeatStreakDist.two, stats.repeatStreakDist.threePlus];
  renderHBarDist("pension-repeat-streak-chart", repeatCounts, (i) => ["반복 없음", "2연속 반복", "3연속 이상 반복"][i]);
}

function renderReappearChart(stats) {
  renderBinBarChart("pension-reappear-chart", stats.gapHistogram);
}

function renderSeasonalGroupLists(stats) {
  const container = document.getElementById("pension-seasonal-group-lists");
  container.innerHTML = "";

  stats.seasonalGroupRanking.forEach((s) => {
    const wrap = document.createElement("div");
    const heading = document.createElement("h3");
    heading.textContent = `${s.season} 조 순위`;
    const list = document.createElement("div");
    list.className = "top-list";
    s.ranking.forEach((x) => list.appendChild(makeGroupMiniItem(x.group, `${x.count}회`)));
    wrap.appendChild(heading);
    wrap.appendChild(list);
    container.appendChild(wrap);
  });
}

/* ---------- 초기화 ---------- */
function init() {
  const stats = computeStats(PENSION_DATA);
  const config = loadConfig();

  initTabs();
  initAdvancedToggle();
  initInfoTooltips();

  renderTrustLine(stats);
  initPensionRoundLookup(stats);
  setupLuckyStoreMapLazyInit("game-pension", "pension-lucky-store-map", "pension-lucky-store-list");
  renderGroupFreqChart(stats);
  renderDigitHeatmap("pension-digit-heatmap", stats.digitFreq);
  renderDigitHeatmap("pension-bonus-digit-heatmap", stats.bonusDigitFreq);
  renderSumChart(stats);
  renderSumStdDev(stats);
  renderPrimeMultipleCharts(stats);
  renderOddDigitChart(stats);
  renderDuplicateDigitChart(stats);
  renderStreakCharts(stats);
  renderPrevRepeatChart(stats);
  renderTrendComparison(stats);
  renderReappearChart(stats);
  renderSeasonalGroupLists(stats);

  const onConfigChange = () => {
    saveConfig(config);
    renderActiveConfigSummary(config);
  };

  initConfigPanel(stats, config, onConfigChange);
  renderActiveConfigSummary(config);

  const doGenerate1 = setupGeneratePanel({
    btnId: "pension-generate-btn",
    containerId: "pension-generated-sets",
    copyAllBtnId: "pension-copy-all-btn",
    warningId: "pension-generate-warning",
    stats,
    config,
  });
  setupGeneratePanel({
    btnId: "pension-generate-btn-2",
    containerId: "pension-generated-sets-2",
    copyAllBtnId: "pension-copy-all-btn-2",
    warningId: "pension-generate-warning-2",
    stats,
    config,
  });

  doGenerate1();
}

document.addEventListener("DOMContentLoaded", init);

/* ---------- 데이터 통계 엑셀 다운로드 ---------- */
function pushTable(rows, title, header, dataRows) {
  rows.push([title]);
  rows.push(header);
  dataRows.forEach((r) => rows.push(r));
  rows.push([]);
}

function buildPensionDataSheet(data) {
  const rows = [["회차", "추첨일", "조", "번호", "보너스"]];
  data.forEach((d) => rows.push([d.no, d.date, d.group, d.num, d.bonus]));
  return rows;
}

function buildPensionStatsSheet(stats) {
  const rows = [];
  const positionLabels = ["1번째", "2번째", "3번째", "4번째", "5번째", "6번째"];

  pushTable(rows, "요약", ["항목", "값"], [
    ["총 회차 수", stats.totalDraws],
    ["최신 회차", stats.lastDraw.no],
    ["최신 추첨일", stats.lastDraw.date],
    ["자릿수 합계 평균", stats.avgSum.toFixed(2)],
    ["자릿수 합계 표준편차", stats.sumStdDev.toFixed(2)],
    ["완전 동일 번호 재출현 여부", stats.hasExactRepeat ? "있음" : "없음"],
  ]);

  pushTable(
    rows,
    "조별 출현 빈도",
    ["조", "출현 횟수"],
    [1, 2, 3, 4, 5].map((g) => [g, stats.groupFreq[g]])
  );

  const digitRows = [];
  stats.digitFreq.forEach((freqs, pos) => {
    digitRows.push([positionLabels[pos], ...freqs]);
  });
  pushTable(rows, "자릿수별 숫자 분포", ["자리", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"], digitRows);

  const bonusDigitRows = [];
  stats.bonusDigitFreq.forEach((freqs, pos) => {
    bonusDigitRows.push([positionLabels[pos], ...freqs]);
  });
  pushTable(rows, "보너스 번호 자릿수별 분포", ["자리", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"], bonusDigitRows);

  pushTable(rows, "자릿수 합계 구간 분포", ["구간", "횟수"], stats.sumBins.map((b) => [`${b.min}~${b.max}`, b.count]));

  pushTable(rows, "홀수 자릿수 개수 분포", ["홀수 개수", "횟수"], stats.oddCountDist.map((c, i) => [i, c]));

  pushTable(
    rows,
    "자릿수 중복 개수 분포",
    ["중복 개수", "횟수"],
    stats.duplicateDigitDist.map((c, i) => [i, c])
  );

  pushTable(
    rows,
    "직전 회차 자릿수 일치 분포",
    ["일치 개수", "횟수"],
    stats.prevDrawRepeatDist.map((c, i) => [i, c])
  );

  pushTable(rows, "소수 자릿수 개수 분포", ["소수 개수", "횟수"], stats.primeDigitCountDist.map((c, i) => [i, c]));
  pushTable(rows, "3의 배수 자릿수 개수 분포", ["3의 배수 개수", "횟수"], stats.multiple3DigitDist.map((c, i) => [i, c]));
  pushTable(rows, "5의 배수 자릿수 개수 분포", ["5의 배수 개수", "횟수"], stats.multiple5DigitDist.map((c, i) => [i, c]));

  pushTable(rows, "오름차순 연속 길이 분포", ["구분", "횟수"], [
    ["연속 없음", stats.ascendStreakDist.none],
    ["2연속", stats.ascendStreakDist.two],
    ["3연속 이상", stats.ascendStreakDist.threePlus],
  ]);

  pushTable(rows, "동일 숫자 연속 반복 길이 분포", ["구분", "횟수"], [
    ["반복 없음", stats.repeatStreakDist.none],
    ["2연속 반복", stats.repeatStreakDist.two],
    ["3연속 이상 반복", stats.repeatStreakDist.threePlus],
  ]);

  pushTable(
    rows,
    "재출현 간격 분포",
    ["간격(회차)", "횟수"],
    stats.gapHistogram.map((b) => [`${b.min}~${b.max}`, b.count])
  );

  const seasonalRows = [];
  stats.seasonalGroupRanking.forEach((s) => {
    s.ranking.forEach((x, i) => seasonalRows.push([s.season, i + 1, x.group, x.count]));
  });
  pushTable(rows, "계절별 인기 조 순위", ["계절", "순위", "조", "횟수"], seasonalRows);

  pushTable(
    rows,
    `최근 ${stats.recentWindow}회 조 순위`,
    ["순위", "조", "횟수"],
    stats.recentGroupRanking.map((x, i) => [i + 1, x.group, x.count])
  );

  return rows;
}

function downloadPensionStatsExcel(data, stats) {
  if (typeof XLSX === "undefined") {
    alert("다운로드 기능을 아직 불러오는 중입니다. 잠시 후 다시 시도해주세요.");
    return;
  }
  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet(buildPensionDataSheet(data));
  const ws2 = XLSX.utils.aoa_to_sheet(buildPensionStatsSheet(stats));
  XLSX.utils.book_append_sheet(wb, ws1, "전체 회차 데이터");
  XLSX.utils.book_append_sheet(wb, ws2, "사이트 통계");
  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `연금복권720_데이터_통계_${today}.xlsx`);
}

function initDownloadButton() {
  const btn = document.getElementById("pension-download-stats-btn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const stats = computeStats(PENSION_DATA);
    downloadPensionStatsExcel(PENSION_DATA, stats);
  });
}

document.addEventListener("DOMContentLoaded", initDownloadButton);
})();
