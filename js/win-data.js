/* ---------- 회차별 당첨 결과 목록 + 당첨 판매점 데이터 (로또·연금복권 공용) ----------
   - data/lotto-prizes.js, data/pension-prizes.js : 회차별 등수별 당첨 인원·금액 (작아서 처음부터 로드)
   - data/win-stores-*.js : 1등 배출 판매점 목록 (수백 KB라서 필요해지는 시점에 불러온다)
   두 데이터 모두 동행복권 공식 사이트 조회 결과를 scripts/build-win-data.pl 로 합친 것이다. */

/* ---------- 표시용 숫자·날짜 ---------- */
function formatWon(n) {
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}

/* 큰 금액을 "20.7억원", "5,028만원" 처럼 짧게 */
function formatWonShort(n) {
  if (n >= 1e8) {
    const v = Math.round((n / 1e8) * 10) / 10;
    return `${v.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}억원`;
  }
  if (n >= 1e4) return `${Math.round(n / 1e4).toLocaleString("ko-KR")}만원`;
  return formatWon(n);
}

/* 총 판매금액 "1,169억 9,288만원" 처럼 */
function formatWonBig(n) {
  const eok = Math.floor(n / 1e8);
  const man = Math.floor((n % 1e8) / 1e4);
  if (eok > 0) return man > 0 ? `${eok.toLocaleString("ko-KR")}억 ${man.toLocaleString("ko-KR")}만원` : `${eok.toLocaleString("ko-KR")}억원`;
  return formatWonShort(n);
}

/* ---------- 당첨 판매점 데이터 로더 ---------- */
const WIN_STORE_SOURCES = {
  lotto: { global: "WIN_STORES_LOTTO", net: "WIN_STORES_LOTTO_NET1", meta: "WIN_STORES_LOTTO_META", src: "data/win-stores-lotto.js?v=1" },
  pension: { global: "WIN_STORES_PENSION", net: "WIN_STORES_PENSION_NET1", meta: "WIN_STORES_PENSION_META", src: "data/win-stores-pension.js?v=1" },
};
const WIN_TYPE_LABEL = ["자동", "수동", "반자동", ""];
const _winStorePromises = {};

/* 게임별로 한 번만 받아서 {stores, byRound, net1} 로 돌려준다 */
function loadWinStores(game) {
  if (_winStorePromises[game]) return _winStorePromises[game];
  const cfg = WIN_STORE_SOURCES[game];
  _winStorePromises[game] = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = cfg.src;
    s.onload = () => {
      const raw = window[cfg.global];
      if (!Array.isArray(raw)) {
        reject(new Error("판매점 데이터를 읽지 못했습니다"));
        return;
      }
      resolve(prepareWinStores(raw, window[cfg.net] || [], window[cfg.meta] || {}));
    };
    s.onerror = () => reject(new Error("판매점 데이터를 불러오지 못했습니다"));
    document.head.appendChild(s);
  }).catch((err) => {
    delete _winStorePromises[game]; // 다음에 다시 시도할 수 있게
    throw err;
  });
  return _winStorePromises[game];
}

function prepareWinStores(raw, net1, meta) {
  const byRound = new Map();
  const stores = raw.map((r) => {
    const wins = r.w.map((x) => ({ round: Math.floor(x / 4), type: x % 4 }));
    const typeCount = [0, 0, 0, 0];
    wins.forEach((w) => typeCount[w.type]++);
    const store = {
      id: r.i,
      name: r.n,
      addr: r.a,
      sido: r.s,
      city: r.c,
      lat: r.la || 0,
      lng: r.lo || 0,
      tel: r.t || "",
      closed: !!r.x,
      wins,
      c1: wins.length,
      c2: r.v || 0,
      last: wins[wins.length - 1].round,
      typeCount,
    };
    wins.forEach((w) => {
      if (!byRound.has(w.round)) byRound.set(w.round, []);
      byRound.get(w.round).push({ store, type: w.type });
    });
    return store;
  });
  return { stores, byRound, net1, hasRank2: !!meta.rank2 };
}

/* 판매점 ID 로 찾기(지도에서 "지도에서 보기"를 눌렀을 때) */
function findWinStore(data, id) {
  return data.stores.find((s) => s.id === id) || null;
}

/* ---------- 회차별 당첨 결과 목록 ----------
   cfg: {
     game: "lotto" | "pension",
     lastNo,                          // 최신 회차
     getDraw(no),                     // 번호 데이터(없으면 undefined)
     renderNumbers(draw, el),         // 번호 표시를 el 안에 그린다
     prizeRows(no),                   // [{rank, cond, count, amount, amountSub, highlight}] 또는 null
     footerText(no),                  // 카드 맨 아래 한 줄(선택)
     firstStoreRound,                 // 판매점 정보가 있는 첫 회차
     listId, inputId, btnId, moreId, resetId, mapTabRoot
   } */
const ROUND_LIST_FIRST = 10;
const ROUND_LIST_STEP = 20;

function initRoundResults(cfg) {
  const listEl = document.getElementById(cfg.listId);
  const inputEl = document.getElementById(cfg.inputId);
  const btnEl = document.getElementById(cfg.btnId);
  const moreEl = document.getElementById(cfg.moreId);
  const resetEl = document.getElementById(cfg.resetId);
  if (!listEl || !inputEl || !btnEl || !moreEl) return;

  inputEl.max = cfg.lastNo;
  let startNo = cfg.lastNo;
  let nextNo = startNo; // 다음에 그릴 회차

  const errorEl = document.createElement("p");
  errorEl.className = "round-lookup-error";
  errorEl.hidden = true;
  listEl.parentNode.insertBefore(errorEl, listEl);

  function appendCards(count, highlightFirst) {
    let drawn = 0;
    while (drawn < count && nextNo >= 1) {
      const card = buildRoundCard(cfg, nextNo);
      if (highlightFirst && drawn === 0) card.classList.add("is-target");
      listEl.appendChild(card);
      nextNo--;
      drawn++;
    }
    updateMore();
  }

  function updateMore() {
    const left = nextNo;
    moreEl.hidden = left < 1;
    moreEl.textContent = `이전 회차 더 보기 (${left.toLocaleString("ko-KR")}개 회차 남음)`;
    if (resetEl) resetEl.hidden = startNo === cfg.lastNo;
  }

  function showFrom(no, highlight) {
    startNo = no;
    nextNo = no;
    listEl.innerHTML = "";
    appendCards(ROUND_LIST_FIRST, highlight);
    inputEl.value = no;
  }

  function doLookup() {
    const no = parseInt(inputEl.value, 10);
    if (!Number.isFinite(no) || no < 1 || no > cfg.lastNo || !cfg.getDraw(no)) {
      errorEl.hidden = false;
      errorEl.textContent = `${Number.isFinite(no) ? no : ""}회는 존재하지 않는 회차입니다. (1~${cfg.lastNo}회)`;
      return;
    }
    errorEl.hidden = true;
    showFrom(no, no !== cfg.lastNo);
  }

  btnEl.addEventListener("click", doLookup);
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doLookup();
  });
  moreEl.addEventListener("click", () => appendCards(ROUND_LIST_STEP, false));
  if (resetEl) {
    resetEl.addEventListener("click", () => {
      errorEl.hidden = true;
      showFrom(cfg.lastNo, false);
    });
  }

  showFrom(cfg.lastNo, false);
}

function buildRoundCard(cfg, no) {
  const draw = cfg.getDraw(no);
  const card = document.createElement("article");
  card.className = "round-card";
  card.dataset.round = no;

  const head = document.createElement("div");
  head.className = "round-card-head";
  const title = document.createElement("span");
  title.className = "round-card-title";
  title.textContent = `${no}회`;
  const date = document.createElement("span");
  date.className = "round-card-date";
  date.textContent = draw ? `${draw.date} 추첨` : "";
  head.appendChild(title);
  head.appendChild(date);
  card.appendChild(head);

  if (draw) {
    const numbers = document.createElement("div");
    numbers.className = "round-card-numbers";
    cfg.renderNumbers(draw, numbers);
    card.appendChild(numbers);
  }

  const rows = cfg.prizeRows(no);
  if (rows) {
    card.appendChild(buildPrizeTable(rows));
    const foot = cfg.footerText && cfg.footerText(no);
    if (foot) {
      const p = document.createElement("p");
      p.className = "round-card-foot";
      p.textContent = foot;
      card.appendChild(p);
    }
  } else {
    const p = document.createElement("p");
    p.className = "round-card-foot";
    p.textContent = "이 회차의 당첨금 정보를 불러오지 못했습니다.";
    card.appendChild(p);
  }

  if (cfg.firstStoreRound && no >= cfg.firstStoreRound) {
    card.appendChild(buildRoundStores(cfg, no));
  }
  return card;
}

function buildPrizeTable(rows) {
  const table = document.createElement("div");
  table.className = "prize-table";
  table.setAttribute("role", "table");

  const head = document.createElement("div");
  head.className = "prize-row prize-head";
  head.setAttribute("role", "row");
  ["등수 · 조건", "당첨자 수", "1인당 당첨금"].forEach((t) => {
    const c = document.createElement("span");
    c.setAttribute("role", "columnheader");
    c.textContent = t;
    head.appendChild(c);
  });
  table.appendChild(head);

  rows.forEach((r) => {
    const row = document.createElement("div");
    row.className = "prize-row" + (r.highlight ? " prize-row-top" : "");
    row.setAttribute("role", "row");

    const rank = document.createElement("span");
    rank.className = "prize-rank";
    rank.setAttribute("role", "cell");
    const rankName = document.createElement("span");
    rankName.className = "prize-rank-name";
    rankName.textContent = r.rank;
    const cond = document.createElement("span");
    cond.className = "prize-rank-cond";
    cond.textContent = r.cond;
    rank.appendChild(rankName);
    rank.appendChild(cond);
    row.appendChild(rank);

    const count = document.createElement("span");
    count.className = "prize-count";
    count.setAttribute("role", "cell");
    count.textContent = r.count === null ? "-" : r.count === 0 ? "없음" : `${r.count.toLocaleString("ko-KR")}명`;
    row.appendChild(count);

    const amount = document.createElement("span");
    amount.className = "prize-amount";
    amount.setAttribute("role", "cell");
    const main = document.createElement("span");
    main.className = "prize-amount-main";
    main.textContent = r.amount;
    amount.appendChild(main);
    if (r.amountSub) {
      const sub = document.createElement("span");
      sub.className = "prize-amount-sub";
      sub.textContent = r.amountSub;
      amount.appendChild(sub);
    }
    row.appendChild(amount);

    table.appendChild(row);
  });
  return table;
}

/* "1등 배출 판매점 N곳" 접이식. 처음 펼칠 때 판매점 데이터를 불러온다. */
function buildRoundStores(cfg, no) {
  const details = document.createElement("details");
  details.className = "round-stores";
  const summary = document.createElement("summary");
  summary.textContent = "1등 배출 판매점 보기";
  details.appendChild(summary);

  const body = document.createElement("div");
  body.className = "round-stores-body";
  details.appendChild(body);

  let loaded = false;
  details.addEventListener("toggle", () => {
    if (!details.open || loaded) return;
    loaded = true;
    body.textContent = "불러오는 중...";
    loadWinStores(cfg.game)
      .then((data) => renderRoundStores(cfg, data, no, summary, body))
      .catch(() => {
        loaded = false;
        body.textContent = "판매점 정보를 불러오지 못했습니다. 잠시 후 다시 열어 주세요.";
      });
  });
  return details;
}

function renderRoundStores(cfg, data, no, summary, body) {
  const list = (data.byRound.get(no) || []).slice().sort((a, b) => a.store.sido.localeCompare(b.store.sido, "ko") || a.store.name.localeCompare(b.store.name, "ko"));
  const net = data.net1[no] || 0;
  summary.textContent = `1등 배출 판매점 ${list.length}곳${net ? ` · 인터넷 ${net}건` : ""}`;
  body.innerHTML = "";

  if (list.length === 0) {
    const p = document.createElement("p");
    p.className = "round-stores-empty";
    p.textContent = net ? "판매점에서 나온 1등은 없고 인터넷 판매에서만 나왔습니다." : "이 회차는 1등 판매점 기록이 없습니다.";
    body.appendChild(p);
    return;
  }

  list.forEach(({ store, type }) => {
    const row = document.createElement("div");
    row.className = "round-store-row";

    const main = document.createElement("span");
    main.className = "round-store-main";
    const name = document.createElement("span");
    name.className = "round-store-name";
    name.textContent = store.name;
    const place = document.createElement("span");
    place.className = "round-store-place";
    place.textContent = [store.sido, store.city].filter(Boolean).join(" ");
    main.appendChild(name);
    main.appendChild(place);
    row.appendChild(main);

    if (WIN_TYPE_LABEL[type]) {
      const tag = document.createElement("span");
      tag.className = "round-store-tag";
      tag.textContent = WIN_TYPE_LABEL[type];
      row.appendChild(tag);
    }
    if (store.closed) {
      const closed = document.createElement("span");
      closed.className = "round-store-tag round-store-tag-closed";
      closed.textContent = "폐점";
      row.appendChild(closed);
    }
    if (store.lat) {
      const go = document.createElement("button");
      go.type = "button";
      go.className = "round-store-go";
      go.textContent = "지도";
      go.addEventListener("click", () => {
        document.dispatchEvent(new CustomEvent("win-store-focus", { detail: { game: cfg.game, id: store.id } }));
      });
      row.appendChild(go);
    }
    body.appendChild(row);
  });
}
