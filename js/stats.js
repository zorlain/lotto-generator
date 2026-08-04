// 전 회차 데이터를 분석해서 통계를 계산한다.
const RECENT_TREND_WINDOW = 50; // "최근 트렌드" 비교에 쓸 최근 회차 수
const PRIME_SET = new Set([2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43]);
const SEASON_NAMES = ["겨울", "봄", "여름", "가을"];

function seasonOfMonth(month) {
  if (month === 12 || month === 1 || month === 2) return 0;
  if (month >= 3 && month <= 5) return 1;
  if (month >= 6 && month <= 8) return 2;
  return 3;
}

function computeStats(data) {
  const freq = new Array(46).fill(0); // index 1~45
  const bonusFreq = new Array(46).fill(0);
  const oddCountDist = new Array(7).fill(0); // 홀수 개수 0~6
  const sums = [];
  const zoneRanges = [
    [1, 9], [10, 19], [20, 29], [30, 39], [40, 45],
  ];
  const zoneCountDist = zoneRanges.map(() => new Array(7).fill(0));
  const lastSeen = new Array(46).fill(0); // 마지막으로 나온 회차
  const gapNow = new Array(46).fill(0); // 마지막 출현 이후 지난 회차 수 (미출현 기간)
  const appearances = Array.from({ length: 46 }, () => []); // 번호별 출현 회차 목록
  const consecutivePairCount = { withConsecutive: 0, withoutConsecutive: 0 };
  const lastDigitDist = new Array(10).fill(0); // 끝자리 0~9
  const pairCounts = new Map(); // "a,b" -> 동시 출현 횟수
  const prevDrawRepeatDist = new Array(7).fill(0); // 직전 회차와 겹치는 번호 개수 0~6
  const acDist = new Array(11).fill(0); // AC값(조합 복잡도) 0~10
  const primeCountDist = new Array(7).fill(0); // 소수 개수 0~6
  const streakDist = { none: 0, two: 0, threePlus: 0 }; // 최장 연속 길이
  const multiple3Dist = new Array(7).fill(0); // 3의 배수 개수 0~6
  const multiple5Dist = new Array(7).fill(0); // 5의 배수 개수 0~6
  const tripleCounts = new Map(); // "a,b,c" -> 동시 출현 횟수
  const seasonFreq = [new Array(46).fill(0), new Array(46).fill(0), new Array(46).fill(0), new Array(46).fill(0)];

  let minSum = Infinity;
  let maxSum = -Infinity;

  for (let i = 0; i < data.length; i++) {
    const draw = data[i];
    const nums = draw.nums;
    let oddCount = 0;
    let sum = 0;
    let primeCount = 0;
    let multiple3Count = 0;
    let multiple5Count = 0;

    for (const n of nums) {
      freq[n]++;
      lastSeen[n] = draw.no;
      appearances[n].push(draw.no);
      if (n % 2 === 1) oddCount++;
      sum += n;
      lastDigitDist[n % 10]++;
      if (PRIME_SET.has(n)) primeCount++;
      if (n % 3 === 0) multiple3Count++;
      if (n % 5 === 0) multiple5Count++;
    }
    bonusFreq[draw.bonus]++;
    primeCountDist[primeCount]++;
    multiple3Dist[multiple3Count]++;
    multiple5Dist[multiple5Count]++;

    if (draw.date) {
      const month = Number(draw.date.split("-")[1]);
      const season = seasonOfMonth(month);
      for (const n of nums) seasonFreq[season][n]++;
    }

    oddCountDist[oddCount]++;
    sums.push(sum);
    if (sum < minSum) minSum = sum;
    if (sum > maxSum) maxSum = sum;

    zoneRanges.forEach((range, zi) => {
      const cnt = nums.filter((n) => n >= range[0] && n <= range[1]).length;
      zoneCountDist[zi][cnt]++;
    });

    const sorted = [...nums].sort((a, b) => a - b);
    let hasConsecutive = false;
    let curStreak = 1;
    let maxStreak = 1;
    for (let k = 0; k < sorted.length - 1; k++) {
      if (sorted[k + 1] - sorted[k] === 1) {
        hasConsecutive = true;
        curStreak++;
        if (curStreak > maxStreak) maxStreak = curStreak;
      } else {
        curStreak = 1;
      }
    }
    if (hasConsecutive) consecutivePairCount.withConsecutive++;
    else consecutivePairCount.withoutConsecutive++;

    if (maxStreak === 1) streakDist.none++;
    else if (maxStreak === 2) streakDist.two++;
    else streakDist.threePlus++;

    // 동시 출현 번호 쌍 / 세 쌍
    for (let a = 0; a < sorted.length; a++) {
      for (let b = a + 1; b < sorted.length; b++) {
        const key = `${sorted[a]},${sorted[b]}`;
        pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
        for (let c = b + 1; c < sorted.length; c++) {
          const tripleKey = `${sorted[a]},${sorted[b]},${sorted[c]}`;
          tripleCounts.set(tripleKey, (tripleCounts.get(tripleKey) || 0) + 1);
        }
      }
    }

    // AC값: 서로 다른 쌍의 차이값 개수 - (n-1)
    const diffs = new Set();
    for (let a = 0; a < sorted.length; a++) {
      for (let b = a + 1; b < sorted.length; b++) {
        diffs.add(sorted[b] - sorted[a]);
      }
    }
    const ac = Math.min(10, Math.max(0, diffs.size - (sorted.length - 1)));
    acDist[ac]++;

    // 직전 회차와 겹치는 번호 개수
    if (i > 0) {
      const prevSet = new Set(data[i - 1].nums);
      const repeatCount = nums.filter((n) => prevSet.has(n)).length;
      prevDrawRepeatDist[repeatCount]++;
    }
  }

  const lastDraw = data[data.length - 1];
  for (let n = 1; n <= 45; n++) {
    gapNow[n] = lastSeen[n] === 0 ? lastDraw.no : lastDraw.no - lastSeen[n];
  }

  // 합계 구간 히스토그램 (구간 폭 15)
  const binWidth = 15;
  const binStart = Math.floor(minSum / binWidth) * binWidth;
  const binEnd = Math.ceil(maxSum / binWidth) * binWidth;
  const sumBins = [];
  for (let b = binStart; b < binEnd; b += binWidth) {
    sumBins.push({ min: b, max: b + binWidth - 1, count: 0 });
  }
  for (const s of sums) {
    const idx = Math.floor((s - binStart) / binWidth);
    sumBins[idx].count++;
  }

  const avgSum = sums.reduce((a, b) => a + b, 0) / sums.length;
  const sumVariance = sums.reduce((a, s) => a + (s - avgSum) ** 2, 0) / sums.length;
  const sumStdDev = Math.sqrt(sumVariance);

  // 번호별 순위 (출현 빈도 내림차순)
  const numberRanking = [];
  for (let n = 1; n <= 45; n++) numberRanking.push({ n, count: freq[n] });
  numberRanking.sort((a, b) => b.count - a.count);

  const hotNumbers = numberRanking.slice(0, 10);
  const coldNumbers = [...numberRanking].sort((a, b) => a.count - b.count).slice(0, 10);

  // 마지막 출현 이후 가장 오래 쉬고 있는 번호 (미출현 기간 랭킹)
  const gapRanking = [];
  for (let n = 1; n <= 45; n++) gapRanking.push({ n, gap: gapNow[n] });
  gapRanking.sort((a, b) => b.gap - a.gap);
  const longGapNumbers = gapRanking.slice(0, 10);

  // 보너스 번호 순위
  const bonusRanking = [];
  for (let n = 1; n <= 45; n++) bonusRanking.push({ n, count: bonusFreq[n] });
  bonusRanking.sort((a, b) => b.count - a.count);
  const bonusHotNumbers = bonusRanking.slice(0, 10);
  const bonusColdNumbers = [...bonusRanking].sort((a, b) => a.count - b.count).slice(0, 10);

  // 자주 함께 나오는 번호 쌍 TOP 10
  const topPairs = [...pairCounts.entries()]
    .map(([key, count]) => {
      const [a, b] = key.split(",").map(Number);
      return { a, b, count };
    })
    .sort((x, y) => y.count - x.count)
    .slice(0, 10);

  // 자주 함께 나오는 번호 세 쌍(트리플) TOP 10
  const topTriples = [...tripleCounts.entries()]
    .map(([key, count]) => {
      const [a, b, c] = key.split(",").map(Number);
      return { a, b, c, count };
    })
    .sort((x, y) => y.count - x.count)
    .slice(0, 10);

  // 계절별(봄/여름/가을/겨울) 인기 번호 TOP 5
  const seasonalHotNumbers = SEASON_NAMES.map((name, si) => {
    const ranking = [];
    for (let n = 1; n <= 45; n++) ranking.push({ n, count: seasonFreq[si][n] });
    ranking.sort((a, b) => b.count - a.count);
    return { season: name, top: ranking.slice(0, 5) };
  });

  // 재출현 간격(한 번 나온 뒤 다시 나오기까지 걸린 회차 수) 히스토그램
  const reappearIntervals = [];
  for (let n = 1; n <= 45; n++) {
    const rounds = appearances[n];
    for (let k = 0; k < rounds.length - 1; k++) {
      reappearIntervals.push(rounds[k + 1] - rounds[k]);
    }
  }
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

  // 궁합(가장 강한 파트너와의 동시 출현 횟수) 랭킹
  const bestPartnerScore = new Array(46).fill(0);
  for (const [key, count] of pairCounts.entries()) {
    const [a, b] = key.split(",").map(Number);
    if (count > bestPartnerScore[a]) bestPartnerScore[a] = count;
    if (count > bestPartnerScore[b]) bestPartnerScore[b] = count;
  }
  const pairScoreRanking = [];
  for (let n = 1; n <= 45; n++) pairScoreRanking.push({ n, score: bestPartnerScore[n] });
  pairScoreRanking.sort((a, b) => b.score - a.score);

  // 최근 N회 vs 전체 기간 트렌드 비교
  const recentData = data.slice(-RECENT_TREND_WINDOW);
  const recentFreq = new Array(46).fill(0);
  for (const draw of recentData) {
    for (const n of draw.nums) recentFreq[n]++;
  }
  const recentRanking = [];
  for (let n = 1; n <= 45; n++) recentRanking.push({ n, count: recentFreq[n] });
  recentRanking.sort((a, b) => b.count - a.count);
  const recentHotNumbers = recentRanking.slice(0, 10);

  return {
    totalDraws: data.length,
    lastDraw,
    freq,
    bonusFreq,
    oddCountDist,
    sums,
    sumBins,
    minSum,
    maxSum,
    avgSum,
    sumStdDev,
    zoneRanges,
    zoneCountDist,
    gapNow,
    primeCountDist,
    streakDist,
    multiple3Dist,
    multiple5Dist,
    topTriples,
    seasonalHotNumbers,
    numberRanking,
    hotNumbers,
    coldNumbers,
    gapRanking,
    longGapNumbers,
    consecutivePairCount,
    lastDigitDist,
    bonusRanking,
    bonusHotNumbers,
    bonusColdNumbers,
    topPairs,
    gapHistogram,
    prevDrawRepeatDist,
    acDist,
    pairScoreRanking,
    recentWindow: RECENT_TREND_WINDOW,
    recentHotNumbers,
  };
}
