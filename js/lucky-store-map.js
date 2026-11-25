/* ---------- 명당 지도 (카카오맵) ----------
   동행복권 공식 '당첨 판매점' 기록으로 만든 data/win-stores-*.js 를 지도에 올린다.
   판매점마다 공식 좌표가 들어 있어 카카오 장소 검색에 기대지 않고, 수천 곳을 클러스터로 묶어 보여준다.

   - 카카오맵 SDK는 <script ... autoload=false>로 불러오고 kakao.maps.load()로 준비 시점을 잡는다.
     로또/연금복권 두 게임이 각자 initLuckyStoreMap을 호출해도 SDK는 한 번만 불러오도록 프라미스를 공유한다.
   - 지도 탭이 처음엔 hidden 상태라 그 안에서 바로 지도를 만들면 크기가 0으로 잡혀 깨지므로
     "명당 지도" 탭을 처음 열 때 지연 생성한다.
   - 판매점 데이터(win-data.js의 loadWinStores)도 이때 처음 받는다. */

const LUCKY_LIST_PAGE_SIZE = 10;

// 지도를 이 레벨(카카오맵 기준, 숫자가 작을수록 확대)만큼 확대하면 명당 외에
// 주변 전체 판매점도 함께 보여준다. 한 번에 너무 많이 찍지 않도록 개수도 제한한다.
const FULL_STORE_ZOOM_LEVEL = 3;
const FULL_STORE_MAX_MARKERS = 150;

// "경기" → "경기도" 같은 정식 명칭. 목록에 없는 값은 그대로 쓴다.
const LUCKY_SIDO_FULL_NAME = {
  서울: "서울특별시",
  경기: "경기도",
  인천: "인천광역시",
  강원: "강원특별자치도",
  충북: "충청북도",
  충남: "충청남도",
  대전: "대전광역시",
  세종: "세종특별자치시",
  전북: "전북특별자치도",
  전남: "전라남도",
  광주: "광주광역시",
  전남광주: "전남광주통합특별시",
  경북: "경상북도",
  경남: "경상남도",
  대구: "대구광역시",
  부산: "부산광역시",
  울산: "울산광역시",
  제주: "제주특별자치도",
};

function luckySidoLabel(sido) {
  return LUCKY_SIDO_FULL_NAME[sido] || sido;
}

/* 지도가 속한 "명당 지도" 탭을 처음 열 때만 지도를 생성한다(게임 패널마다 버튼이
   따로 있으므로 rootId로 범위를 좁혀 그 안의 버튼만 찾는다).
   회차 목록의 "지도" 버튼(win-store-focus 이벤트)이 오면 이 탭으로 넘어와 그 판매점을 연다. */
function setupLuckyStoreMapLazyInit(rootId, options) {
  const root = document.getElementById(rootId);
  if (!root) return;
  const btn = root.querySelector('[data-tab="map"]');
  if (!btn) return;
  const ctl = { started: false, pendingFocus: null, focus: null };

  btn.addEventListener("click", () => {
    if (ctl.started) return;
    ctl.started = true;
    // requestAnimationFrame은 탭이 비활성/백그라운드일 때 지연되거나 아예 안 불릴 수 있어
    // setTimeout을 쓴다(hidden→visible 레이아웃이 반영될 정도로만 한 틱 늦추면 충분하다).
    setTimeout(() => initLuckyStoreMap(options, ctl), 0);
  });

  document.addEventListener("win-store-focus", (e) => {
    if (!e.detail || e.detail.game !== options.game) return;
    ctl.pendingFocus = e.detail.id;
    btn.click(); // 탭 전환(그리고 첫 방문이면 지도 생성)
    const card = root.querySelector(".lucky-store-card");
    if (card) setTimeout(() => card.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    if (ctl.focus) {
      ctl.focus(ctl.pendingFocus);
      ctl.pendingFocus = null;
    }
  });
}

function loadKakaoSdk() {
  return new Promise((resolve, reject) => {
    if (typeof KAKAO_JS_KEY === "undefined" || !KAKAO_JS_KEY || KAKAO_JS_KEY.indexOf("PLACEHOLDER") === 0) {
      reject(new Error("카카오 JS 키가 설정되지 않았습니다"));
      return;
    }
    const script = document.createElement("script");
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&libraries=clusterer&autoload=false`;
    script.onload = resolve;
    script.onerror = () => reject(new Error("카카오맵 SDK 로드 실패"));
    document.head.appendChild(script);
  });
}

let _kakaoReadyPromise = null;
function kakaoReady() {
  if (_kakaoReadyPromise) return _kakaoReadyPromise;
  _kakaoReadyPromise = loadKakaoSdk()
    .then(() => new Promise((resolve) => kakao.maps.load(() => resolve(true))))
    .catch((err) => {
      console.error(err);
      return false;
    });
  return _kakaoReadyPromise;
}

/* ---------- 마커 이미지 ----------
   1회 배출은 작은 점, 2회 이상은 횟수가 적힌 원(많을수록 크게). 폐점한 곳은 회색. */
const _markerImageCache = {};
function winStoreMarkerImage(count, closed) {
  const key = `${Math.min(count, 99)}${closed ? "x" : ""}`;
  if (_markerImageCache[key]) return _markerImageCache[key];

  const fill = closed ? "#9ca3af" : count >= 10 ? "#c2410c" : count >= 5 ? "#ea580c" : "#f59e0b";
  let d, svg;
  if (count <= 1) {
    d = 14;
    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}"><circle cx="7" cy="7" r="5.5" fill="${fill}" stroke="#fff" stroke-width="1.8"/></svg>`;
  } else {
    d = count >= 20 ? 40 : count >= 10 ? 34 : count >= 5 ? 28 : 22;
    const r = d / 2 - 1.5;
    const fs = count >= 100 ? 11 : count >= 10 ? 13 : 12;
    svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}">` +
      `<circle cx="${d / 2}" cy="${d / 2}" r="${r}" fill="${fill}" stroke="#fff" stroke-width="2"/>` +
      `<text x="${d / 2}" y="${d / 2 + fs * 0.36}" text-anchor="middle" font-size="${fs}" font-weight="700" font-family="sans-serif" fill="#fff">${count}</text></svg>`;
  }
  const image = new kakao.maps.MarkerImage("data:image/svg+xml;base64," + btoa(svg), new kakao.maps.Size(d, d), {
    offset: new kakao.maps.Point(d / 2, d / 2),
  });
  _markerImageCache[key] = image;
  return image;
}

/* 전체 판매점(명당 아닌 일반 판매점) 마커용 작은 원형 아이콘 */
let _fullStoreMarkerImage = null;
function fullStoreMarkerImage() {
  if (!_fullStoreMarkerImage) {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14">' +
      '<circle cx="7" cy="7" r="6" fill="#8b93f0" stroke="#ffffff" stroke-width="1.5"/></svg>';
    _fullStoreMarkerImage = new kakao.maps.MarkerImage("data:image/svg+xml;base64," + btoa(svg), new kakao.maps.Size(14, 14), {
      offset: new kakao.maps.Point(7, 7),
    });
  }
  return _fullStoreMarkerImage;
}

function buildFullStoreInfoContent(store) {
  const wrap = document.createElement("div");
  wrap.className = "lucky-store-infowindow";

  const name = document.createElement("div");
  name.className = "lucky-store-infowindow-name";
  name.textContent = store.n;
  wrap.appendChild(name);

  const addrText = document.createElement("div");
  addrText.className = "lucky-store-infowindow-addr";
  addrText.textContent = store.a;
  wrap.appendChild(addrText);

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "lucky-store-copy-btn";
  copyBtn.textContent = "복사";
  copyBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const ok = await copyToClipboard(store.a);
    if (ok) flashCopied(copyBtn, "복사됨");
  });
  wrap.appendChild(copyBtn);
  return wrap;
}

function buildMarkerLabel(store, hasRank2) {
  const wrap = document.createElement("div");
  wrap.className = "lucky-store-infowindow lucky-store-infowindow-mini";
  const name = document.createElement("div");
  name.className = "lucky-store-infowindow-name";
  name.textContent = store.name;
  const stats = document.createElement("div");
  stats.className = "lucky-store-infowindow-stats";
  stats.textContent = `1등 ${store.c1}회${hasRank2 && store.c2 ? ` · 2등 ${store.c2}회` : ""}`;
  wrap.appendChild(name);
  wrap.appendChild(stats);
  return wrap;
}

function winEl(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/* 판매점 하나의 자세한 정보 카드 */
function buildStoreDetail(store, options, hasRank2) {
  const wrap = winEl("div", "win-detail");

  const head = winEl("div", "win-detail-head");
  head.appendChild(winEl("span", "win-detail-name", store.name));
  head.appendChild(winEl("span", "win-badge" + (store.closed ? " win-badge-closed" : " win-badge-open"), store.closed ? "폐점" : "영업 중"));
  wrap.appendChild(head);

  const addrRow = winEl("div", "win-detail-addr");
  addrRow.appendChild(winEl("span", "win-detail-addr-text", store.addr || "주소 정보 없음"));
  if (store.addr) {
    const copyBtn = winEl("button", "win-mini-btn", "주소 복사");
    copyBtn.type = "button";
    copyBtn.addEventListener("click", async () => {
      const ok = await copyToClipboard(store.addr);
      if (ok) flashCopied(copyBtn, "복사됨");
    });
    addrRow.appendChild(copyBtn);
  }
  wrap.appendChild(addrRow);

  if (store.tel) {
    const telRow = winEl("div", "win-detail-tel");
    const a = winEl("a", "", store.tel);
    a.href = `tel:${store.tel.replace(/[^0-9+]/g, "")}`;
    telRow.appendChild(winEl("span", "win-detail-label", "전화"));
    telRow.appendChild(a);
    wrap.appendChild(telRow);
  }

  const stats = winEl("div", "win-detail-stats");
  const box = (label, value, sub) => {
    const b = winEl("div", "win-stat");
    b.appendChild(winEl("span", "win-stat-label", label));
    b.appendChild(winEl("span", "win-stat-value", value));
    if (sub) b.appendChild(winEl("span", "win-stat-sub", sub));
    return b;
  };
  stats.appendChild(box("1등 배출", `${store.c1}회`));
  if (hasRank2) stats.appendChild(box("2등 배출", `${store.c2}회`));
  else stats.classList.add("win-detail-stats-2");
  const lastDate = options.drawDate ? options.drawDate(store.last) : "";
  stats.appendChild(box("최근 1등", `${store.last}회`, lastDate || ""));
  wrap.appendChild(stats);

  const typeParts = [];
  store.typeCount.forEach((n, i) => {
    if (n && WIN_TYPE_LABEL[i]) typeParts.push(`${WIN_TYPE_LABEL[i]} ${n}회`);
  });
  if (typeParts.length) {
    const t = winEl("p", "win-detail-types");
    t.appendChild(winEl("span", "win-detail-label", "1등 구분"));
    t.appendChild(document.createTextNode(typeParts.join(" · ")));
    wrap.appendChild(t);
  }

  // 당첨 회차 목록(최신순). 많으면 앞의 12개만 보여주고 펼치게 한다.
  const rounds = store.wins.slice().reverse();
  const roundsBox = winEl("div", "win-detail-rounds");
  roundsBox.appendChild(winEl("span", "win-detail-label", "1등 당첨 회차"));
  const chips = winEl("div", "win-chips");
  const renderChips = (all) => {
    chips.innerHTML = "";
    (all ? rounds : rounds.slice(0, 12)).forEach((w) => {
      const date = options.drawDate ? options.drawDate(w.round) : "";
      const chip = winEl("span", "win-chip", `${w.round}회${WIN_TYPE_LABEL[w.type] ? " · " + WIN_TYPE_LABEL[w.type] : ""}`);
      if (date) chip.title = `${date} 추첨`;
      chips.appendChild(chip);
    });
    if (rounds.length > 12) {
      const t = winEl("button", "win-chip win-chip-toggle", all ? "접기" : `전체 ${rounds.length}회 보기`);
      t.type = "button";
      t.addEventListener("click", () => renderChips(!all));
      chips.appendChild(t);
    }
  };
  renderChips(false);
  roundsBox.appendChild(chips);
  wrap.appendChild(roundsBox);

  if (store.lat) {
    const links = winEl("div", "win-detail-links");
    const nameEnc = encodeURIComponent(store.name);
    const route = winEl("a", "win-link-btn", "카카오맵 길찾기");
    route.href = `https://map.kakao.com/link/to/${nameEnc},${store.lat},${store.lng}`;
    route.target = "_blank";
    route.rel = "noopener";
    const view = winEl("a", "win-link-btn win-link-btn-ghost", "카카오맵에서 보기");
    view.href = `https://map.kakao.com/link/map/${nameEnc},${store.lat},${store.lng}`;
    view.target = "_blank";
    view.rel = "noopener";
    links.appendChild(route);
    links.appendChild(view);
    wrap.appendChild(links);
  } else {
    wrap.appendChild(winEl("p", "win-detail-note", "공식 기록에 위치 정보가 없어 지도에는 표시되지 않습니다."));
  }
  return wrap;
}

async function initLuckyStoreMap(options, ctl) {
  const mapContainer = document.getElementById(options.mapId);
  const listContainer = document.getElementById(options.listId);
  const sidoSelect = document.getElementById(options.sidoSelectId);
  const citySelect = document.getElementById(options.citySelectId);
  const sortSelect = document.getElementById(options.sortSelectId);
  const searchInput = document.getElementById(options.searchId);
  const openOnly = document.getElementById(options.openOnlyId);
  const moreBtn = document.getElementById(options.moreBtnId);
  const hintEl = document.getElementById(options.hintId);
  const detailEl = document.getElementById(options.detailId);
  const summaryEl = document.getElementById(options.summaryId);
  const expandBtn = document.getElementById(options.expandBtnId);
  if (!mapContainer || !listContainer) return;

  mapContainer.innerHTML = '<p class="lucky-store-map-error">지도를 불러오는 중...</p>';
  const [ready, data] = await Promise.all([
    kakaoReady(),
    loadWinStores(options.game).catch((err) => {
      console.error(err);
      return null;
    }),
  ]);
  if (!data) {
    mapContainer.innerHTML = '<p class="lucky-store-map-error">판매점 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</p>';
    ctl.started = false; // 탭을 다시 누르면 재시도할 수 있게
    return;
  }
  // 지도(카카오맵)가 안 뜨는 환경이어도 목록·검색·상세 정보는 쓸 수 있게 지도 부분만 건너뛴다.
  const hasMap = !!ready;
  if (hasMap) {
    mapContainer.innerHTML = "";
  } else {
    mapContainer.innerHTML = '<p class="lucky-store-map-error">지도를 불러오지 못했습니다. 아래 목록은 그대로 쓸 수 있어요.</p>';
    if (expandBtn) expandBtn.hidden = true;
    if (hintEl) hintEl.hidden = true;
  }

  const map = hasMap ? new kakao.maps.Map(mapContainer, { center: new kakao.maps.LatLng(36.2, 127.9), level: 13 }) : null;
  if (map) map.relayout();

  const stores = data.stores;
  const infoWindow = hasMap ? new kakao.maps.InfoWindow({ zIndex: 3, removable: false }) : null;
  const fullStoreInfoWindow = hasMap ? new kakao.maps.InfoWindow({ zIndex: 2 }) : null;

  const clusterer = !hasMap ? null : new kakao.maps.MarkerClusterer({
    map,
    averageCenter: true,
    minLevel: 5,
    gridSize: 70,
    calculator: [20, 100],
    styles: [
      { width: "40px", height: "40px", background: "rgba(55,65,81,0.88)", borderRadius: "20px", color: "#fff", textAlign: "center", fontWeight: "700", fontSize: "13px", lineHeight: "40px" },
      { width: "50px", height: "50px", background: "rgba(55,65,81,0.9)", borderRadius: "25px", color: "#fff", textAlign: "center", fontWeight: "700", fontSize: "14px", lineHeight: "50px" },
      { width: "60px", height: "60px", background: "rgba(31,41,55,0.92)", borderRadius: "30px", color: "#fff", textAlign: "center", fontWeight: "700", fontSize: "15px", lineHeight: "60px" },
    ],
  });

  // 판매점마다 마커를 하나씩 만들어 둔다(필터가 바뀌면 보일 것만 클러스터러에 다시 넣는다)
  const markerOf = new Map();
  let selectedId = null;
  stores.forEach((s) => {
    if (!hasMap || !s.lat) return;
    const marker = new kakao.maps.Marker({
      position: new kakao.maps.LatLng(s.lat, s.lng),
      image: winStoreMarkerImage(s.c1, s.closed),
      title: s.name,
      zIndex: Math.min(s.c1, 50),
    });
    kakao.maps.event.addListener(marker, "click", () => selectStore(s, { pan: false }));
    markerOf.set(s.id, marker);
  });

  // 2등 기록이 없는 데이터면 "2등 많은 순" 정렬을 뺀다
  if (!data.hasRank2 && sortSelect) {
    const opt = sortSelect.querySelector('option[value="wins2"]');
    if (opt) opt.remove();
  }

  // ---------- 필터 상태 ----------
  const state = { sido: "", city: "", query: "", openOnly: true, sort: "wins1", shown: LUCKY_LIST_PAGE_SIZE };

  const sorters = {
    wins1: (a, b) => b.c1 - a.c1 || b.last - a.last || a.name.localeCompare(b.name, "ko"),
    recent: (a, b) => b.last - a.last || b.c1 - a.c1,
    wins2: (a, b) => b.c2 - a.c2 || b.c1 - a.c1,
  };

  function matching() {
    const q = state.query.trim().toLowerCase();
    return stores
      .filter((s) => {
        if (state.openOnly && s.closed) return false;
        if (state.sido && s.sido !== state.sido) return false;
        if (state.city && s.city !== state.city) return false;
        if (q && !(s.name.toLowerCase().includes(q) || s.addr.toLowerCase().includes(q))) return false;
        return true;
      })
      .sort(sorters[state.sort]);
  }

  // 시/도 목록: 판매점 수가 많은 순
  function fillSidoSelect() {
    const counts = new Map();
    stores.forEach((s) => counts.set(s.sido, (counts.get(s.sido) || 0) + 1));
    sidoSelect.innerHTML = "";
    const all = winEl("option", "", `전국 (${stores.length.toLocaleString("ko-KR")}곳)`);
    all.value = "";
    sidoSelect.appendChild(all);
    Array.from(counts.keys())
      .sort((a, b) => counts.get(b) - counts.get(a))
      .forEach((sido) => {
        const o = winEl("option", "", `${luckySidoLabel(sido)} (${counts.get(sido)})`);
        o.value = sido;
        sidoSelect.appendChild(o);
      });
    sidoSelect.value = state.sido;
  }

  function fillCitySelect() {
    citySelect.innerHTML = "";
    const all = winEl("option", "", state.sido ? "시/군/구 전체" : "시/군/구 (시/도를 먼저 선택)");
    all.value = "";
    citySelect.appendChild(all);
    citySelect.disabled = !state.sido;
    if (state.sido) {
      const counts = new Map();
      stores.forEach((s) => {
        if (s.sido === state.sido && s.city) counts.set(s.city, (counts.get(s.city) || 0) + 1);
      });
      Array.from(counts.keys())
        .sort((a, b) => counts.get(b) - counts.get(a) || a.localeCompare(b, "ko"))
        .forEach((city) => {
          const o = winEl("option", "", `${city} (${counts.get(city)})`);
          o.value = city;
          citySelect.appendChild(o);
        });
    }
    citySelect.value = state.city;
  }

  // ---------- 지도 반영 ----------
  function showOnMap(list, fit) {
    if (!hasMap) return;
    const markers = [];
    list.forEach((s) => {
      const m = markerOf.get(s.id);
      if (m) markers.push(m);
    });
    clusterer.clear();
    clusterer.addMarkers(markers);
    infoWindow.close();
    if (!fit) return;
    if (markers.length === 0) return;
    if (markers.length === 1) {
      map.setCenter(markers[0].getPosition());
      map.setLevel(4);
      return;
    }
    if (!state.sido && !state.query) {
      map.setCenter(new kakao.maps.LatLng(36.2, 127.9));
      map.setLevel(13);
      return;
    }
    const bounds = new kakao.maps.LatLngBounds();
    markers.forEach((m) => bounds.extend(m.getPosition()));
    map.setBounds(bounds);
  }

  // ---------- 목록 ----------
  let currentList = [];

  function renderList() {
    listContainer.innerHTML = "";
    if (summaryEl) {
      const first = Math.min(...stores.map((s) => s.wins[0].round));
      const openN = currentList.filter((s) => !s.closed).length;
      summaryEl.textContent = `${first}회~${options.lastNo}회 공식 기록 기준 · 조건에 맞는 1등 배출 판매점 ${currentList.length.toLocaleString("ko-KR")}곳${
        state.openOnly ? "" : ` (영업 중 ${openN.toLocaleString("ko-KR")}곳)`
      }`;
    }

    if (currentList.length === 0) {
      listContainer.appendChild(winEl("p", "lucky-store-empty", "조건에 맞는 판매점이 없습니다. 검색어나 지역을 바꿔 보세요."));
      moreBtn.hidden = true;
      return;
    }

    currentList.slice(0, state.shown).forEach((s, i) => {
      const item = winEl("div", "lucky-store-item" + (s.id === selectedId ? " is-selected" : ""));
      item.dataset.id = s.id;
      item.appendChild(winEl("span", "lucky-store-item-rank", String(i + 1)));

      const main = winEl("span", "lucky-store-item-main");
      const nameRow = winEl("span", "lucky-store-item-name");
      nameRow.appendChild(document.createTextNode(s.name));
      if (s.closed) nameRow.appendChild(winEl("span", "win-badge win-badge-closed", "폐점"));
      main.appendChild(nameRow);
      main.appendChild(winEl("span", "lucky-store-item-region", [luckySidoLabel(s.sido), s.city].filter(Boolean).join(" ")));
      item.appendChild(main);

      const sortWins2 = state.sort === "wins2";
      const stats = winEl("span", "lucky-store-item-count");
      stats.textContent = sortWins2 ? `2등 ${s.c2}회 · 1등 ${s.c1}회` : `1등 ${s.c1}회${data.hasRank2 && s.c2 ? ` · 2등 ${s.c2}회` : ""}`;
      item.appendChild(stats);

      item.addEventListener("click", () => selectStore(s, { pan: true, scroll: true }));
      listContainer.appendChild(item);
    });

    const left = currentList.length - state.shown;
    moreBtn.hidden = left <= 0;
    moreBtn.textContent = left > 0 ? `더보기 (${Math.min(left, LUCKY_LIST_PAGE_SIZE)}곳 더 · 남은 ${left.toLocaleString("ko-KR")}곳)` : "";
  }

  function apply(fit) {
    state.shown = LUCKY_LIST_PAGE_SIZE;
    currentList = matching();
    showOnMap(currentList, fit);
    renderList();
    if (selectedId && !currentList.some((s) => s.id === selectedId)) clearSelection();
  }

  // ---------- 선택 ----------
  function clearSelection() {
    selectedId = null;
    if (infoWindow) infoWindow.close();
    if (detailEl) {
      detailEl.hidden = true;
      detailEl.innerHTML = "";
    }
  }

  function selectStore(s, opts) {
    selectedId = s.id;
    const marker = hasMap ? markerOf.get(s.id) : null;
    if (marker) {
      infoWindow.setContent(buildMarkerLabel(s, data.hasRank2));
      infoWindow.open(map, marker);
      if (opts.pan) {
        if (map.getLevel() > 4) map.setLevel(4);
        map.panTo(marker.getPosition());
      }
    } else if (infoWindow) {
      infoWindow.close();
    }
    if (detailEl) {
      detailEl.innerHTML = "";
      detailEl.appendChild(buildStoreDetail(s, options, data.hasRank2));
      const close = winEl("button", "win-detail-close", "닫기");
      close.type = "button";
      close.addEventListener("click", () => {
        clearSelection();
        renderList();
      });
      detailEl.firstChild.appendChild(close);
      detailEl.hidden = false;
      if (opts.scroll) detailEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    listContainer.querySelectorAll(".lucky-store-item").forEach((n) => n.classList.toggle("is-selected", n.dataset.id === s.id));
  }

  /* 회차 목록의 "지도" 버튼으로 들어온 경우: 전체 보기로 풀고 그 판매점을 연다 */
  function focusStore(id) {
    const s = stores.find((x) => x.id === id);
    if (!s) return;
    state.sido = "";
    state.city = "";
    state.query = "";
    state.openOnly = false;
    if (openOnly) openOnly.checked = false;
    if (searchInput) searchInput.value = "";
    fillSidoSelect();
    fillCitySelect();
    apply(false);
    setTimeout(() => {
      if (map) map.relayout();
      selectStore(s, { pan: true, scroll: false });
    }, 120);
  }
  ctl.focus = focusStore;

  // ---------- 일반 판매점 레이어(확대했을 때만) ----------
  let fullStoreMarkers = [];
  let fullStoreLoaded = false;

  function clearFullStoreMarkers() {
    fullStoreMarkers.forEach((m) => m.setMap(null));
    fullStoreMarkers = [];
  }

  async function renderFullStoresInView() {
    if (map.getLevel() > FULL_STORE_ZOOM_LEVEL) {
      clearFullStoreMarkers();
      if (hintEl) {
        hintEl.hidden = false;
        hintEl.textContent = "지도를 더 확대하면 주변의 다른 판매점도 함께 표시돼요";
      }
      return;
    }
    if (!fullStoreLoaded) {
      if (hintEl) {
        hintEl.hidden = false;
        hintEl.textContent = "주변 판매점을 불러오는 중...";
      }
      try {
        await loadAllFullStoreShards();
        fullStoreLoaded = true;
      } catch (err) {
        console.error(err);
        if (hintEl) hintEl.textContent = "주변 판매점을 불러오지 못했습니다.";
        return;
      }
    }
    if (hintEl) hintEl.hidden = true;

    const bounds = map.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    clearFullStoreMarkers();

    let count = 0;
    for (let i = 0; i < FULL_STORE_DATA.length && count < FULL_STORE_MAX_MARKERS; i++) {
      const s = FULL_STORE_DATA[i];
      if (options.gameFlag === "l" && s.l !== "Y") continue;
      if (options.gameFlag === "p" && s.p !== "Y") continue;
      if (s.la < sw.getLat() || s.la > ne.getLat() || s.lo < sw.getLng() || s.lo > ne.getLng()) continue;

      const marker = new kakao.maps.Marker({
        map,
        position: new kakao.maps.LatLng(s.la, s.lo),
        image: fullStoreMarkerImage(),
        title: s.n,
        zIndex: 1,
      });
      kakao.maps.event.addListener(marker, "click", () => {
        fullStoreInfoWindow.setContent(buildFullStoreInfoContent(s));
        fullStoreInfoWindow.open(map, marker);
      });
      fullStoreMarkers.push(marker);
      count++;
    }
  }
  if (hasMap) kakao.maps.event.addListener(map, "idle", renderFullStoresInView);

  // 창 크기가 바뀌어도(모바일 회전, 크게 보기) 카카오맵은 자동으로 다시 맞추지 않으므로
  // 컨테이너 크기 변화를 감지해 relayout만 해 준다(사용자가 맞춰 둔 확대/위치는 유지한다).
  let resizeTimer = null;
  if (hasMap) {
    new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => map.relayout(), 120);
    }).observe(mapContainer);
  }

  // ---------- 컨트롤 연결 ----------
  fillSidoSelect();
  fillCitySelect();
  sidoSelect.addEventListener("change", () => {
    state.sido = sidoSelect.value;
    state.city = "";
    fillCitySelect();
    apply(true);
  });
  citySelect.addEventListener("change", () => {
    state.city = citySelect.value;
    apply(true);
  });
  if (sortSelect) {
    sortSelect.addEventListener("change", () => {
      state.sort = sortSelect.value;
      apply(false);
    });
  }
  if (openOnly) {
    openOnly.checked = state.openOnly;
    openOnly.addEventListener("change", () => {
      state.openOnly = openOnly.checked;
      apply(true);
    });
  }
  if (searchInput) {
    let t = null;
    searchInput.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        state.query = searchInput.value;
        apply(true);
      }, 200);
    });
  }
  moreBtn.addEventListener("click", () => {
    state.shown += LUCKY_LIST_PAGE_SIZE;
    renderList();
  });
  if (expandBtn) {
    expandBtn.addEventListener("click", () => {
      const wrap = mapContainer.closest(".lucky-store-map-wrap");
      const on = wrap.classList.toggle("is-expanded");
      expandBtn.textContent = on ? "지도 줄이기" : "지도 크게 보기";
      expandBtn.setAttribute("aria-pressed", on ? "true" : "false");
      if (map) setTimeout(() => map.relayout(), 60);
      if (on) wrap.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  apply(true);
  if (ctl.pendingFocus) {
    focusStore(ctl.pendingFocus);
    ctl.pendingFocus = null;
  }
}
