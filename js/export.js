/* ---------- 데이터 통계 엑셀 다운로드 ---------- */
function pushTable(rows, title, header, dataRows) {
  rows.push([title]);
  rows.push(header);
  dataRows.forEach((r) => rows.push(r));
  rows.push([]);
}

function buildLottoDataSheet(data) {
  const rows = [["회차", "추첨일", "번호1", "번호2", "번호3", "번호4", "번호5", "번호6", "보너스"]];
  data.forEach((d) => rows.push([d.no, d.date, ...d.nums, d.bonus]));
  return rows;
}

function buildLottoStatsSheet(stats) {
  const rows = [];

  pushTable(rows, "요약", ["항목", "값"], [
    ["총 회차 수", stats.totalDraws],
    ["최신 회차", stats.lastDraw.no],
    ["최신 추첨일", stats.lastDraw.date],
    ["평균 합계", stats.avgSum.toFixed(2)],
    ["합계 표준편차", stats.sumStdDev.toFixed(2)],
    ["최소 합계", stats.minSum],
    ["최대 합계", stats.maxSum],
  ]);

  pushTable(
    rows,
    "번호별 출현 빈도",
    ["번호", "출현 횟수"],
    Array.from({ length: 45 }, (_, i) => [i + 1, stats.freq[i + 1]])
  );

  pushTable(
    rows,
    "보너스 번호 출현 빈도",
    ["번호", "출현 횟수"],
    Array.from({ length: 45 }, (_, i) => [i + 1, stats.bonusFreq[i + 1]])
  );

  pushTable(rows, "홀수 개수 분포", ["홀수 개수", "횟수"], stats.oddCountDist.map((c, i) => [i, c]));

  pushTable(rows, "합계 구간 분포", ["구간", "횟수"], stats.sumBins.map((b) => [`${b.min}~${b.max}`, b.count]));

  pushTable(
    rows,
    "구간별(1~9, 10~19, 20~29, 30~39, 40~45) 분포",
    ["구간", "0개", "1개", "2개", "3개", "4개", "5개", "6개"],
    stats.zoneRanges.map((r, zi) => [`${r[0]}~${r[1]}`, ...stats.zoneCountDist[zi]])
  );

  pushTable(rows, "끝자리 분포", ["끝자리", "횟수"], stats.lastDigitDist.map((c, i) => [i, c]));

  pushTable(rows, "소수 개수 분포", ["소수 개수", "횟수"], stats.primeCountDist.map((c, i) => [i, c]));
  pushTable(rows, "3의 배수 개수 분포", ["3의 배수 개수", "횟수"], stats.multiple3Dist.map((c, i) => [i, c]));
  pushTable(rows, "5의 배수 개수 분포", ["5의 배수 개수", "횟수"], stats.multiple5Dist.map((c, i) => [i, c]));

  pushTable(rows, "AC값(조합 복잡도) 분포", ["AC값", "횟수"], stats.acDist.map((c, i) => [i, c]));

  pushTable(rows, "최장 연속 길이 분포", ["구분", "횟수"], [
    ["연속 없음", stats.streakDist.none],
    ["2연속", stats.streakDist.two],
    ["3연속 이상", stats.streakDist.threePlus],
  ]);

  pushTable(
    rows,
    "직전 회차 재출현 개수 분포",
    ["재출현 개수", "횟수"],
    stats.prevDrawRepeatDist.map((c, i) => [i, c])
  );

  pushTable(
    rows,
    "재출현 간격 분포",
    ["간격(회차)", "횟수"],
    stats.gapHistogram.map((b) => [`${b.min}~${b.max}`, b.count])
  );

  pushTable(
    rows,
    "자주 함께 나오는 번호 쌍 TOP 10",
    ["순위", "번호A", "번호B", "동시출현 횟수"],
    stats.topPairs.map((p, i) => [i + 1, p.a, p.b, p.count])
  );

  pushTable(
    rows,
    "자주 함께 나오는 세 번호 조합 TOP 10",
    ["순위", "번호A", "번호B", "번호C", "동시출현 횟수"],
    stats.topTriples.map((t, i) => [i + 1, t.a, t.b, t.c, t.count])
  );

  const seasonalRows = [];
  stats.seasonalHotNumbers.forEach((s) => {
    s.top.forEach((x, i) => seasonalRows.push([s.season, i + 1, x.n, x.count]));
  });
  pushTable(rows, "계절별 인기 번호 TOP 5", ["계절", "순위", "번호", "횟수"], seasonalRows);

  pushTable(
    rows,
    `최근 ${stats.recentWindow}회 인기 번호 TOP 10`,
    ["순위", "번호", "횟수"],
    stats.recentHotNumbers.map((x, i) => [i + 1, x.n, x.count])
  );

  return rows;
}

function downloadLottoStatsExcel(data, stats) {
  if (typeof XLSX === "undefined") {
    alert("다운로드 기능을 아직 불러오는 중입니다. 잠시 후 다시 시도해주세요.");
    return;
  }
  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet(buildLottoDataSheet(data));
  const ws2 = XLSX.utils.aoa_to_sheet(buildLottoStatsSheet(stats));
  XLSX.utils.book_append_sheet(wb, ws1, "전체 회차 데이터");
  XLSX.utils.book_append_sheet(wb, ws2, "사이트 통계");
  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `로또645_데이터_통계_${today}.xlsx`);
}

function initDownloadButton() {
  const btn = document.getElementById("download-stats-btn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const stats = computeStats(LOTTO_DATA);
    downloadLottoStatsExcel(LOTTO_DATA, stats);
  });
}

document.addEventListener("DOMContentLoaded", initDownloadButton);
