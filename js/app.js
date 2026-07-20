function ballColor(n) {
  if (n <= 10) return "ball-yellow";
  if (n <= 20) return "ball-blue";
  if (n <= 30) return "ball-red";
  if (n <= 40) return "ball-gray";
  return "ball-green";
}

function makeBall(n, extraClass) {
  const span = document.createElement("span");
  span.className = `ball ${ballColor(n)} ${extraClass || ""}`;
  span.textContent = n;
  return span;
}

function makeMiniItem(n, countLabel) {
  const wrap = document.createElement("div");
  wrap.className = "mini-item";
  wrap.appendChild(makeBall(n));
  const c = document.createElement("span");
  c.className = "mini-count";
  c.textContent = countLabel;
  wrap.appendChild(c);
  return wrap;
}

const SET_LABELS = ["A", "B", "C", "D", "E"];

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

/* ---------- 탭 전환 ---------- */
function initTabs() {
  const buttons = document.querySelectorAll(".tab-btn");
  const panels = document.querySelectorAll(".tab-panel");

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

/* ---------- 번호 생성 (탭1, 탭2 공용) ---------- */
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
    set.nums.forEach((n) => balls.appendChild(makeBall(n)));
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
      copyToClipboard(set.nums.join(", "));
      flashCopied(copyBtn, "✅ 복사됨");
    });
    actions.appendChild(copyBtn);

    row.appendChild(actions);
    container.appendChild(row);
  });
}

// 생성 버튼 + 결과 영역 + 전체복사 버튼 한 세트를 연결한다. 탭1과 탭2에서 각각 독립적으로 쓴다.
function setupGeneratePanel({ btnId, containerId, copyAllBtnId, stats, config }) {
  const state = { sets: [] };
  const btn = document.getElementById(btnId);
  const copyAllBtn = document.getElementById(copyAllBtnId);

  const doGenerate = () => {
    state.sets = generateSets(stats, config, 5);
    renderSetsInto(containerId, state.sets);
  };

  btn.addEventListener("click", doGenerate);
  copyAllBtn.addEventListener("click", () => {
    if (!state.sets.length) return;
    const text = state.sets
      .map((set, i) => `${SET_LABELS[i] || i + 1}: ${set.nums.join(", ")}`)
      .join("\n");
    copyToClipboard(text);
    flashCopied(copyAllBtn, "✅ 전체 복사 완료");
  });

  return doGenerate;
}

/* ---------- 탭 2: 심화 설정 펼치기/접기 ---------- */
function initAdvancedToggle() {
  const toggleBtn = document.getElementById("advanced-toggle");
  const section = document.getElementById("advanced-section");

  toggleBtn.addEventListener("click", () => {
    const willShow = section.hidden;
    section.hidden = !willShow;
    toggleBtn.textContent = willShow
      ? "🔬 심화 설정 접기"
      : "🔬 심화 설정 펼쳐보기 (7개)";
  });
}

function renderActiveConfigSummary(config) {
  const active = [];
  if (config.oddEven.enabled) {
    const { manualMin, manualMax } = config.oddEven;
    active.push(
      manualMin === manualMax ? `홀${manualMin}짝${6 - manualMin}` : `홀${manualMin}~${manualMax}개`
    );
  }
  if (config.sumRange.enabled) {
    active.push(`합계 ${config.sumRange.manualMin}~${config.sumRange.manualMax}`);
  }
  if (config.zoneSpread.enabled) {
    const set = config.zoneSpread.zoneTargets.filter((v) => v !== null).length;
    active.push(set > 0 ? `구간분포(${set}개 구간 지정)` : "구간분포(자동)");
  }
  if (config.freq.enabled) {
    active.push(`${config.freq.direction === "hot" ? "HOT" : "COLD"} 상위${config.freq.topN}개`);
  }
  if (config.gap.enabled) active.push(`${config.gap.threshold}회+ 미출현 우대`);
  if (config.lastDigit.enabled) active.push(`끝자리 최대${config.lastDigit.maxSameDigit}개`);
  if (config.coOccurrence.enabled) active.push(`궁합번호 상위${config.coOccurrence.topN}개`);
  if (config.consecutive.enabled) {
    const labels = { auto: "연속번호(자동)", require: "연속번호 포함", exclude: "연속번호 제외" };
    active.push(labels[config.consecutive.mode]);
  }
  if (config.acRange.enabled) {
    active.push(`AC ${config.acRange.manualMin}~${config.acRange.manualMax}`);
  }
  if (config.prevRepeat.enabled) {
    active.push(
      config.prevRepeat.mode === "manual"
        ? `직전회차 재출현 ${config.prevRepeat.manualMin}~${config.prevRepeat.manualMax}개`
        : "직전회차 재출현(자동)"
    );
  }

  const el = document.getElementById("active-config-summary");
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

/* ---------- 탭 2: 맞춤 번호 생성 ---------- */
function initConfigPanel(stats, config, onChange) {
  const resyncFns = [];

  // 홀짝 비율 (항상 직접 범위 지정)
  const oddEnabled = document.getElementById("opt-oddeven-enabled");
  const oddManualWrap = document.getElementById("opt-oddeven-manual-wrap");

  const renderOddSlider = bindDualSlider({
    minEl: document.getElementById("opt-oddeven-min"),
    maxEl: document.getElementById("opt-oddeven-max"),
    fillEl: document.getElementById("opt-oddeven-fill"),
    labelEl: document.getElementById("opt-oddeven-labels"),
    format: (a, b) => (a === b ? `홀${a} 짝${6 - a}` : `홀${a}~${b}개 (짝${6 - b}~${6 - a}개)`),
    getRange: () => ({ min: config.oddEven.manualMin, max: config.oddEven.manualMax }),
    setRange: (a, b) => {
      config.oddEven.manualMin = a;
      config.oddEven.manualMax = b;
    },
    onChange,
  });

  const syncOddEven = () => {
    oddManualWrap.classList.toggle("disabled-field", !config.oddEven.enabled);
  };

  const resyncOddEven = () => {
    oddEnabled.checked = config.oddEven.enabled;
    renderOddSlider();
    syncOddEven();
  };
  resyncOddEven();
  resyncFns.push(resyncOddEven);

  oddEnabled.addEventListener("change", () => {
    config.oddEven.enabled = oddEnabled.checked;
    syncOddEven();
    onChange();
  });

  // 번호 합계 구간 (항상 직접 범위 지정)
  const sumEnabled = document.getElementById("opt-sumrange-enabled");
  const sumManualWrap = document.getElementById("opt-sumrange-manual-wrap");

  const renderSumSlider = bindDualSlider({
    minEl: document.getElementById("opt-sumrange-min"),
    maxEl: document.getElementById("opt-sumrange-max"),
    fillEl: document.getElementById("opt-sumrange-fill"),
    labelEl: document.getElementById("opt-sumrange-labels"),
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

  // 구간별 분포 (구간마다 "자동" 또는 정확한 개수를 지정)
  const zoneEnabled = document.getElementById("opt-zone-enabled");
  const zoneRowsWrap = document.getElementById("opt-zone-rows");
  const zoneHint = document.getElementById("opt-zone-hint");
  const zoneLabels = stats.zoneRanges.map((r) => `${r[0]}~${r[1]}`);
  const zoneSelects = [];

  zoneLabels.forEach((label, zi) => {
    const row = document.createElement("div");
    row.className = "field-row zone-select-row";

    const labelEl = document.createElement("span");
    labelEl.className = "field-label zone-select-label";
    labelEl.textContent = label;

    const select = document.createElement("select");
    select.dataset.zoneIndex = String(zi);
    const autoOpt = document.createElement("option");
    autoOpt.value = "auto";
    autoOpt.textContent = "자동";
    select.appendChild(autoOpt);
    for (let c = 0; c <= 6; c++) {
      const opt = document.createElement("option");
      opt.value = String(c);
      opt.textContent = `${c}개`;
      select.appendChild(opt);
    }

    row.appendChild(labelEl);
    row.appendChild(select);
    zoneRowsWrap.appendChild(row);
    zoneSelects.push(select);
  });

  const syncZone = () => {
    zoneSelects.forEach((s) => (s.disabled = !config.zoneSpread.enabled));
    const total = config.zoneSpread.zoneTargets.reduce((a, v) => a + (v || 0), 0);
    if (config.zoneSpread.zoneTargets.some((v) => v !== null)) {
      zoneHint.textContent =
        total > 6
          ? `⚠️ 지정한 개수의 합(${total}개)이 6개를 초과했습니다. 조합을 찾기 어려울 수 있어요.`
          : `지정한 개수의 합: ${total} / 6개`;
    } else {
      zoneHint.textContent = "";
    }
  };

  const resyncZone = () => {
    zoneEnabled.checked = config.zoneSpread.enabled;
    zoneSelects.forEach((select, zi) => {
      const v = config.zoneSpread.zoneTargets[zi];
      select.value = v === null ? "auto" : String(v);
    });
    syncZone();
  };
  resyncZone();
  resyncFns.push(resyncZone);

  zoneEnabled.addEventListener("change", () => {
    config.zoneSpread.enabled = zoneEnabled.checked;
    syncZone();
    onChange();
  });
  zoneSelects.forEach((select) => {
    select.addEventListener("change", () => {
      const zi = Number(select.dataset.zoneIndex);
      config.zoneSpread.zoneTargets[zi] = select.value === "auto" ? null : Number(select.value);
      syncZone();
      onChange();
    });
  });

  // 출현 빈도 가중치
  const freqEnabled = document.getElementById("opt-freq-enabled");
  const freqTopN = document.getElementById("opt-freq-topn");
  const freqRadios = document.querySelectorAll('input[name="opt-freq-direction"]');

  const syncFreq = () => {
    freqTopN.disabled = !config.freq.enabled;
    freqRadios.forEach((r) => (r.disabled = !config.freq.enabled));
  };

  const resyncFreq = () => {
    freqEnabled.checked = config.freq.enabled;
    freqTopN.value = config.freq.topN;
    freqRadios.forEach((radio) => {
      radio.checked = radio.value === config.freq.direction;
    });
    syncFreq();
  };
  resyncFreq();
  resyncFns.push(resyncFreq);

  freqEnabled.addEventListener("change", () => {
    config.freq.enabled = freqEnabled.checked;
    syncFreq();
    onChange();
  });
  freqTopN.addEventListener("input", () => {
    config.freq.topN = Math.min(45, Math.max(1, Number(freqTopN.value) || 1));
    onChange();
  });
  freqRadios.forEach((radio) => {
    radio.addEventListener("change", () => {
      if (radio.checked) {
        config.freq.direction = radio.value;
        onChange();
      }
    });
  });

  // 미출현 기간 가중치
  const gapEnabled = document.getElementById("opt-gap-enabled");
  const gapThreshold = document.getElementById("opt-gap-threshold");
  const gapHint = document.getElementById("opt-gap-hint");

  const syncGap = () => {
    gapThreshold.disabled = !config.gap.enabled;
    const qualifying = stats.gapNow.slice(1).filter((g) => g >= config.gap.threshold).length;
    gapHint.textContent = `현재 이 조건에 해당하는 번호: ${qualifying}개`;
  };

  const resyncGap = () => {
    gapEnabled.checked = config.gap.enabled;
    gapThreshold.value = config.gap.threshold;
    syncGap();
  };
  resyncGap();
  resyncFns.push(resyncGap);

  gapEnabled.addEventListener("change", () => {
    config.gap.enabled = gapEnabled.checked;
    syncGap();
    onChange();
  });
  gapThreshold.addEventListener("input", () => {
    config.gap.threshold = Math.max(1, Number(gapThreshold.value) || 1);
    syncGap();
    onChange();
  });

  // 끝자리 중복 제한
  const lastDigitEnabled = document.getElementById("opt-lastdigit-enabled");
  const lastDigitMax = document.getElementById("opt-lastdigit-max");

  const syncLastDigit = () => {
    lastDigitMax.disabled = !config.lastDigit.enabled;
  };
  const resyncLastDigit = () => {
    lastDigitEnabled.checked = config.lastDigit.enabled;
    lastDigitMax.value = String(config.lastDigit.maxSameDigit);
    syncLastDigit();
  };
  resyncLastDigit();
  resyncFns.push(resyncLastDigit);

  lastDigitEnabled.addEventListener("change", () => {
    config.lastDigit.enabled = lastDigitEnabled.checked;
    syncLastDigit();
    onChange();
  });
  lastDigitMax.addEventListener("change", () => {
    config.lastDigit.maxSameDigit = Number(lastDigitMax.value);
    onChange();
  });

  // 궁합 번호 가중치
  const coOccurEnabled = document.getElementById("opt-cooccur-enabled");
  const coOccurTopN = document.getElementById("opt-cooccur-topn");

  const syncCoOccur = () => {
    coOccurTopN.disabled = !config.coOccurrence.enabled;
  };
  const resyncCoOccur = () => {
    coOccurEnabled.checked = config.coOccurrence.enabled;
    coOccurTopN.value = config.coOccurrence.topN;
    syncCoOccur();
  };
  resyncCoOccur();
  resyncFns.push(resyncCoOccur);

  coOccurEnabled.addEventListener("change", () => {
    config.coOccurrence.enabled = coOccurEnabled.checked;
    syncCoOccur();
    onChange();
  });
  coOccurTopN.addEventListener("input", () => {
    config.coOccurrence.topN = Math.min(45, Math.max(1, Number(coOccurTopN.value) || 1));
    onChange();
  });

  // 연속번호 포함 방식
  const consecutiveEnabled = document.getElementById("opt-consecutive-enabled");
  const consecutiveMode = document.getElementById("opt-consecutive-mode");

  const syncConsecutive = () => {
    consecutiveMode.disabled = !config.consecutive.enabled;
  };
  const resyncConsecutive = () => {
    consecutiveEnabled.checked = config.consecutive.enabled;
    consecutiveMode.value = config.consecutive.mode;
    syncConsecutive();
  };
  resyncConsecutive();
  resyncFns.push(resyncConsecutive);

  consecutiveEnabled.addEventListener("change", () => {
    config.consecutive.enabled = consecutiveEnabled.checked;
    syncConsecutive();
    onChange();
  });
  consecutiveMode.addEventListener("change", () => {
    config.consecutive.mode = consecutiveMode.value;
    onChange();
  });

  // 조합 복잡도(AC값) 범위 (항상 직접 범위 지정)
  const acEnabled = document.getElementById("opt-ac-enabled");
  const acManualWrap = document.getElementById("opt-ac-manual-wrap");

  const renderAcSlider = bindDualSlider({
    minEl: document.getElementById("opt-ac-min"),
    maxEl: document.getElementById("opt-ac-max"),
    fillEl: document.getElementById("opt-ac-fill"),
    labelEl: document.getElementById("opt-ac-labels"),
    format: (a, b) => (a === b ? `AC ${a}` : `AC ${a} ~ ${b}`),
    getRange: () => ({ min: config.acRange.manualMin, max: config.acRange.manualMax }),
    setRange: (a, b) => {
      config.acRange.manualMin = a;
      config.acRange.manualMax = b;
    },
    onChange,
  });

  const syncAc = () => {
    acManualWrap.classList.toggle("disabled-field", !config.acRange.enabled);
  };
  const resyncAc = () => {
    acEnabled.checked = config.acRange.enabled;
    renderAcSlider();
    syncAc();
  };
  resyncAc();
  resyncFns.push(resyncAc);

  acEnabled.addEventListener("change", () => {
    config.acRange.enabled = acEnabled.checked;
    syncAc();
    onChange();
  });

  // 직전 회차 재출현 개수
  const prevRepeatEnabled = document.getElementById("opt-prevrepeat-enabled");
  const prevRepeatMode = document.getElementById("opt-prevrepeat-mode");
  const prevRepeatManualWrap = document.getElementById("opt-prevrepeat-manual-wrap");
  document.getElementById("opt-prevrepeat-drawno").textContent = stats.lastDraw.no;

  const renderPrevRepeatSlider = bindDualSlider({
    minEl: document.getElementById("opt-prevrepeat-min"),
    maxEl: document.getElementById("opt-prevrepeat-max"),
    fillEl: document.getElementById("opt-prevrepeat-fill"),
    labelEl: document.getElementById("opt-prevrepeat-labels"),
    format: (a, b) => (a === b ? `${a}개` : `${a} ~ ${b}개`),
    getRange: () => ({ min: config.prevRepeat.manualMin, max: config.prevRepeat.manualMax }),
    setRange: (a, b) => {
      config.prevRepeat.manualMin = a;
      config.prevRepeat.manualMax = b;
    },
    onChange,
  });

  const syncPrevRepeat = () => {
    prevRepeatMode.disabled = !config.prevRepeat.enabled;
    prevRepeatManualWrap.classList.toggle("disabled-field", !config.prevRepeat.enabled);
    prevRepeatManualWrap.style.display = config.prevRepeat.mode === "manual" ? "block" : "none";
  };
  const resyncPrevRepeat = () => {
    prevRepeatEnabled.checked = config.prevRepeat.enabled;
    prevRepeatMode.value = config.prevRepeat.mode;
    renderPrevRepeatSlider();
    syncPrevRepeat();
  };
  resyncPrevRepeat();
  resyncFns.push(resyncPrevRepeat);

  prevRepeatEnabled.addEventListener("change", () => {
    config.prevRepeat.enabled = prevRepeatEnabled.checked;
    syncPrevRepeat();
    onChange();
  });
  prevRepeatMode.addEventListener("change", () => {
    config.prevRepeat.mode = prevRepeatMode.value;
    syncPrevRepeat();
    onChange();
  });

  document.getElementById("reset-config-btn").addEventListener("click", () => {
    const fresh = defaultConfig();
    Object.keys(fresh).forEach((key) => Object.assign(config[key], fresh[key]));
    resyncFns.forEach((fn) => fn());
    onChange();
  });
}

/* ---------- 탭 3: 데이터 통계 ---------- */
function renderTrustLine(stats) {
  document.getElementById("stats-trust-line").textContent =
    `1회 ~ ${stats.lastDraw.no}회 (${stats.lastDraw.date}) · 총 ${stats.totalDraws.toLocaleString()}개 회차 전수 분석`;
}

function renderFreqChart(stats) {
  const container = document.getElementById("freq-chart");
  container.innerHTML = "";
  const max = Math.max(...stats.freq.slice(1));
  const hotSet = new Set(stats.hotNumbers.map((x) => x.n));
  const coldSet = new Set(stats.coldNumbers.map((x) => x.n));

  for (let n = 1; n <= 45; n++) {
    const col = document.createElement("div");
    col.className = "freq-col";

    const bar = document.createElement("div");
    bar.className = `freq-bar ${ballColor(n)}`;
    if (hotSet.has(n)) bar.classList.add("freq-hot");
    if (coldSet.has(n)) bar.classList.add("freq-cold");
    const pct = (stats.freq[n] / max) * 100;
    bar.style.height = `${Math.max(pct, 3)}%`;
    bar.title = `${n}번: ${stats.freq[n]}회 출현`;

    const countLabel = document.createElement("div");
    countLabel.className = "freq-count";
    countLabel.textContent = stats.freq[n];

    const numLabel = document.createElement("div");
    numLabel.className = "freq-num";
    numLabel.textContent = n;

    col.appendChild(countLabel);
    col.appendChild(bar);
    col.appendChild(numLabel);
    container.appendChild(col);
  }

  const hotList = document.getElementById("hot-list");
  const coldList = document.getElementById("cold-list");
  const gapList = document.getElementById("gap-list");
  hotList.innerHTML = "";
  coldList.innerHTML = "";
  gapList.innerHTML = "";

  stats.hotNumbers.forEach((x) => hotList.appendChild(makeMiniItem(x.n, `${x.count}회`)));
  stats.coldNumbers.forEach((x) => coldList.appendChild(makeMiniItem(x.n, `${x.count}회`)));
  stats.longGapNumbers.forEach((x) => gapList.appendChild(makeMiniItem(x.n, `${x.gap}회째`)));
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

function renderOddEvenChart(stats) {
  renderHBarDist("odd-even-chart", stats.oddCountDist, (i) => `홀${i} 짝${6 - i}`);
}

function renderSumChart(stats) {
  renderBinBarChart("sum-chart", stats.sumBins);
}

function renderLastDigitChart(stats) {
  renderHBarDist("lastdigit-chart", stats.lastDigitDist, (i) => `끝자리 ${i}`);
}

function renderBonusLists(stats) {
  const hotList = document.getElementById("bonus-hot-list");
  const coldList = document.getElementById("bonus-cold-list");
  hotList.innerHTML = "";
  coldList.innerHTML = "";
  stats.bonusHotNumbers.forEach((x) => hotList.appendChild(makeMiniItem(x.n, `${x.count}회`)));
  stats.bonusColdNumbers.forEach((x) => coldList.appendChild(makeMiniItem(x.n, `${x.count}회`)));
}

function renderPairList(stats) {
  const container = document.getElementById("pair-list");
  container.innerHTML = "";

  stats.topPairs.forEach((p, idx) => {
    const row = document.createElement("div");
    row.className = "pair-row";

    const rank = document.createElement("span");
    rank.className = "pair-rank";
    rank.textContent = String(idx + 1);

    const balls = document.createElement("div");
    balls.className = "pair-balls";
    balls.appendChild(makeBall(p.a));
    balls.appendChild(makeBall(p.b));

    const count = document.createElement("span");
    count.className = "pair-count";
    count.textContent = `${p.count}회 동시 출현`;

    row.appendChild(rank);
    row.appendChild(balls);
    row.appendChild(count);
    container.appendChild(row);
  });
}

function renderCombinationTraits(stats) {
  const withPct = ((stats.consecutivePairCount.withConsecutive / stats.totalDraws) * 100).toFixed(1);
  document.getElementById("consecutive-stat").textContent =
    `연속번호가 1쌍 이상 포함된 회차: 전체의 ${withPct}% (${stats.consecutivePairCount.withConsecutive.toLocaleString()} / ${stats.totalDraws.toLocaleString()}회)`;
  renderHBarDist("ac-chart", stats.acDist, (i) => (i === 10 ? "AC 10+" : `AC ${i}`));
}

function renderReappearChart(stats) {
  renderBinBarChart("reappear-chart", stats.gapHistogram);
}

function renderPrevRepeatChart(stats) {
  renderHBarDist("prevrepeat-chart", stats.prevDrawRepeatDist, (i) => `${i}개 재출현`);
}

function renderTrendComparison(stats) {
  document.getElementById("trend-desc").textContent =
    `최근 ${stats.recentWindow}회와 전체 ${stats.totalDraws.toLocaleString()}회 기준 HOT 번호를 비교합니다.`;
  document.getElementById("trend-recent-title").textContent = `최근 ${stats.recentWindow}회 HOT TOP 10`;

  const allList = document.getElementById("trend-all-list");
  const recentList = document.getElementById("trend-recent-list");
  allList.innerHTML = "";
  recentList.innerHTML = "";
  stats.hotNumbers.forEach((x) => allList.appendChild(makeMiniItem(x.n, `${x.count}회`)));
  stats.recentHotNumbers.forEach((x) => recentList.appendChild(makeMiniItem(x.n, `${x.count}회`)));
}

function renderZoneChart(stats) {
  const container = document.getElementById("zone-chart");
  container.innerHTML = "";
  const zoneLabels = stats.zoneRanges.map((r) => `${r[0]}-${r[1]}`);

  stats.zoneRanges.forEach((range, zi) => {
    const dist = stats.zoneCountDist[zi];
    const total = dist.reduce((a, b) => a + b, 0);
    const avg =
      dist.reduce((sum, cnt, numPerDraw) => sum + cnt * numPerDraw, 0) / total;

    const row = document.createElement("div");
    row.className = "zone-row";

    const label = document.createElement("div");
    label.className = "zone-label";
    label.textContent = zoneLabels[zi];

    const track = document.createElement("div");
    track.className = "zone-track";
    const bar = document.createElement("div");
    bar.className = "zone-fill";
    bar.style.width = `${(avg / 6) * 100}%`;
    track.appendChild(bar);

    const value = document.createElement("div");
    value.className = "zone-value";
    value.textContent = `평균 ${avg.toFixed(2)}개`;

    row.appendChild(label);
    row.appendChild(track);
    row.appendChild(value);
    container.appendChild(row);
  });
}

/* ---------- 초기화 ---------- */
function init() {
  const stats = computeStats(LOTTO_DATA);
  const config = loadConfig();

  initTabs();
  initAdvancedToggle();

  renderTrustLine(stats);
  renderFreqChart(stats);
  renderOddEvenChart(stats);
  renderSumChart(stats);
  renderZoneChart(stats);
  renderLastDigitChart(stats);
  renderBonusLists(stats);
  renderPairList(stats);
  renderCombinationTraits(stats);
  renderReappearChart(stats);
  renderPrevRepeatChart(stats);
  renderTrendComparison(stats);

  const onConfigChange = () => {
    saveConfig(config);
    renderActiveConfigSummary(config);
  };

  initConfigPanel(stats, config, onConfigChange);
  renderActiveConfigSummary(config);

  const doGenerate1 = setupGeneratePanel({
    btnId: "generate-btn",
    containerId: "generated-sets",
    copyAllBtnId: "copy-all-btn",
    stats,
    config,
  });
  setupGeneratePanel({
    btnId: "generate-btn-2",
    containerId: "generated-sets-2",
    copyAllBtnId: "copy-all-btn-2",
    stats,
    config,
  });

  doGenerate1();
}

document.addEventListener("DOMContentLoaded", init);
