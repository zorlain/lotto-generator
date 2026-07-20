// 전 회차 데이터를 분석해서 통계를 계산한다.
const RECENT_TREND_WINDOW = 50; // "최근 트렌드" 비교에 쓸 최근 회차 수

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

  let minSum = Infinity;
  let maxSum = -Infinity;

  for (let i = 0; i < data.length; i++) {
    const draw = data[i];
    const nums = draw.nums;
    let oddCount = 0;
    let sum = 0;

    for (const n of nums) {
      freq[n]++;
      lastSeen[n] = draw.no;
      appearances[n].push(draw.no);
      if (n % 2 === 1) oddCount++;
      sum += n;
      lastDigitDist[n % 10]++;
    }
    bonusFreq[draw.bonus]++;

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
    for (let k = 0; k < sorted.length - 1; k++) {
      if (sorted[k + 1] - sorted[k] === 1) {
        hasConsecutive = true;
        break;
      }
    }
    if (hasConsecutive) consecutivePairCount.withConsecutive++;
    else consecutivePairCount.withoutConsecutive++;

    // 동시 출현 번호 쌍
    for (let a = 0; a < sorted.length; a++) {
      for (let b = a + 1; b < sorted.length; b++) {
        const key = `${sorted[a]},${sorted[b]}`;
        pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
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
    zoneRanges,
    zoneCountDist,
    gapNow,
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
