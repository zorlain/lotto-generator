// 탭2("맞춤 번호 생성")에서 사용자가 켜고 끄고, 직접 값으로 지정하는 생성 설정.
// 홀짝 비율 / 번호 합계 구간 / 조합 복잡도(AC값)는 "기본 설정"으로, 항상 직접 범위 지정(mode: "manual")만 사용한다.
const CONFIG_STORAGE_KEY = "lotto-gen-config-v8";
const MAX_INCLUDE_NUMBERS = 5;

function defaultConfig() {
  return {
    // 직접 고른 번호를 생성 결과에 반드시 포함시킨다 (최대 MAX_INCLUDE_NUMBERS개).
    // rowCount: 5줄 중 몇 줄에만 포함시킬지 (나머지 줄은 다른 조건만으로 자동 생성).
    includeNumbers: { enabled: false, numbers: [], rowCount: 5 },
    oddEven: { enabled: true, mode: "manual", manualMin: 2, manualMax: 4 },
    sumRange: {
      enabled: true,
      mode: "manual",
      manualMin: 90,
      manualMax: 180,
    },
    acRange: { enabled: true, mode: "manual", manualMin: 7, manualMax: 10 },
    // 아래는 전부 "심화 설정" — 초기값은 모두 꺼짐(체크 해제) 상태로 시작한다.
    // zoneTargets[i]: i번째 구간에서 나와야 할 정확한 개수. null이면 자동(제한 없음).
    zoneSpread: { enabled: false, zoneTargets: [null, null, null, null, null] },
    freq: { enabled: false, direction: "hot", topN: 15 },
    gap: { enabled: false, threshold: 15 },
    consecutive: { enabled: false, mode: "auto" },
    // maxSameDigit: 같은 끝자리(1의 자리)를 최대 몇 개까지 허용할지. null이면 자동(제한 없음).
    lastDigit: { enabled: false, maxSameDigit: 2 },
    // 궁합(동시 출현이 강한) 번호 상위 N개를 우대
    coOccurrence: { enabled: false, topN: 15 },
    prevRepeat: { enabled: false, mode: "auto", manualMin: 0, manualMax: 2 },
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
