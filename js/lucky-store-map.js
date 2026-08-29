/* ---------- 로또 명당 지도 (카카오맵) ----------
   카카오맵 SDK는 <script ... autoload=false>로 불러오고, kakao.maps.load()로 준비 완료
   시점을 잡는다. 로또/연금복권 두 게임 패널이 각자 initLuckyStoreMap을 호출해도
   kakao.maps.load 콜백 등록은 한 번만 하도록 kakaoReady()로 프라미스를 공유한다.
   지도 탭이 처음엔 hidden 상태라 그 안에서 바로 지도를 만들면 크기가 0으로 잡혀 깨지므로,
   "데이터 통계" 탭을 처음 열 때(레이아웃이 잡힌 뒤) 지연 생성한다.

   장소 검색(키워드 검색)은 페이지당 한 번만 전체 목록에 대해 수행하고, 그 결과(좌표 +
   도로명/지번 주소)를 캐싱해둔다. 시/도·시군구 필터를 눌러도 재검색하지 않고 마커를
   보이기/숨기기만 해서 API 호출을 아낀다. */

const LUCKY_LIST_PAGE_SIZE = 5;

/* 지도가 속한 "데이터 통계" 탭을 처음 열 때만 지도를 생성한다(게임 패널마다 버튼이
   따로 있으므로 rootId로 범위를 좁혀 그 안의 버튼만 찾는다). */
function setupLuckyStoreMapLazyInit(rootId, mapId, listId, sidoSelectId, citySelectId, moreBtnId) {
  const root = document.getElementById(rootId);
  if (!root) return;
  const btn = root.querySelector('[data-tab="stats"]');
  if (!btn) return;
  let started = false;
  btn.addEventListener("click", () => {
    if (started) return;
    started = true;
    // requestAnimationFrame은 탭이 비활성/백그라운드일 때 지연되거나 아예 안 불릴 수 있어
    // setTimeout을 쓴다(hidden→visible 레이아웃이 반영될 정도로만 한 틱 늦추면 충분하다).
    setTimeout(() => initLuckyStoreMap(mapId, listId, sidoSelectId, citySelectId, moreBtnId), 0);
  });
}

/* "경기 성남시" 같은 축약 지역 표기를 "경기도 성남시"처럼 정식 시/도 명칭으로 바꿔준다. */
function fullRegionLabel(store) {
  const full = LUCKY_SIDO_FULL_NAME[store.sido] || store.sido;
  return store.city ? `${full} ${store.city}` : full;
}

function loadKakaoSdk() {
  return new Promise((resolve, reject) => {
    if (typeof KAKAO_JS_KEY === "undefined" || !KAKAO_JS_KEY || KAKAO_JS_KEY.indexOf("PLACEHOLDER") === 0) {
      reject(new Error("카카오 JS 키가 설정되지 않았습니다"));
      return;
    }
    const script = document.createElement("script");
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&libraries=services&autoload=false`;
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

/* 주소 복사 버튼이 담긴 정보창 DOM을 만든다. copyToClipboard/flashCopied는
   app.js·pension-bundle.js에 이미 있는 전역 헬퍼를 재사용한다. */
function buildLuckyStoreInfoContent(entry) {
  const wrap = document.createElement("div");
  wrap.className = "lucky-store-infowindow";

  const name = document.createElement("div");
  name.className = "lucky-store-infowindow-name";
  name.textContent = entry.store.name;
  wrap.appendChild(name);

  if (entry.store.count || entry.store.count2) {
    const stats = document.createElement("div");
    stats.className = "lucky-store-infowindow-stats";
    const parts = [];
    if (entry.store.count) parts.push(`1등 ${entry.store.count}회`);
    if (entry.store.count2) parts.push(`2등 ${entry.store.count2}회`);
    stats.textContent = parts.join(" · ");
    wrap.appendChild(stats);
  }

  const addrText = document.createElement("div");
  addrText.className = "lucky-store-infowindow-addr";
  addrText.textContent = entry.address || entry.store.region;
  wrap.appendChild(addrText);

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "lucky-store-copy-btn";
  copyBtn.textContent = "복사";
  copyBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const ok = await copyToClipboard(entry.address || entry.store.region);
    if (ok) flashCopied(copyBtn, "복사됨");
  });
  wrap.appendChild(copyBtn);

  return wrap;
}

async function initLuckyStoreMap(mapId, listId, sidoSelectId, citySelectId, moreBtnId) {
  const mapContainer = document.getElementById(mapId);
  const listContainer = document.getElementById(listId);
  const sidoSelect = sidoSelectId ? document.getElementById(sidoSelectId) : null;
  const citySelect = citySelectId ? document.getElementById(citySelectId) : null;
  const moreBtn = moreBtnId ? document.getElementById(moreBtnId) : null;
  if (!mapContainer || !listContainer) return;

  const ready = await kakaoReady();
  if (!ready) {
    mapContainer.innerHTML =
      '<p class="lucky-store-map-error">지도를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</p>';
    return;
  }

  const map = new kakao.maps.Map(mapContainer, {
    center: new kakao.maps.LatLng(36.2, 127.9),
    level: 13,
  });
  map.relayout();

  const places = new kakao.maps.services.Places();
  const infoWindow = new kakao.maps.InfoWindow({ zIndex: 1 });
  const entries = new Array(LUCKY_STORES.length);
  let currentSido = LUCKY_REGIONS[0];
  let currentCity = "전체";
  let showAll = false;

  // 창 크기가 바뀌어도(모바일 회전 등) 카카오맵은 자동으로 다시 맞추지 않으므로
  // 컨테이너 크기 변화를 감지해 relayout + 현재 범위 재조정을 해준다.
  let resizeTimer = null;
  const resizeObserver = new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      map.relayout();
      fitToSelection();
    }, 150);
  });
  resizeObserver.observe(mapContainer);

  const openStoreInfo = (entry) => {
    infoWindow.setContent(buildLuckyStoreInfoContent(entry));
    infoWindow.open(map, entry.marker);
    map.panTo(entry.pos);
  };

  // 1등 배출 횟수(count) 상위 순으로 정렬. count가 없는 곳은 뒤로 밀린다.
  function matchingEntries() {
    return entries
      .filter(
        (e) => e && e.store.sido === currentSido && (currentCity === "전체" || e.store.city === currentCity)
      )
      .sort((a, b) => (b.store.count || 0) - (a.store.count || 0));
  }

  function citiesForCurrentSido() {
    const best = new Map();
    entries.forEach((e) => {
      if (e && e.store.sido === currentSido) {
        const prev = best.get(e.store.city) || 0;
        best.set(e.store.city, Math.max(prev, e.store.count || 0));
      }
    });
    return Array.from(best.keys()).sort((a, b) => best.get(b) - best.get(a));
  }

  function fitToSelection() {
    const all = matchingEntries();
    all.forEach((e) => e.marker.setMap(map));
    entries.forEach((e) => {
      if (e && !all.includes(e)) e.marker.setMap(null);
    });

    if (all.length === 0) {
      infoWindow.close();
      return;
    }
    if (all.length === 1) {
      map.setCenter(all[0].pos);
      map.setLevel(6);
      return;
    }
    const bounds = new kakao.maps.LatLngBounds();
    all.forEach((e) => bounds.extend(e.pos));
    map.setBounds(bounds);
  }

  const renderList = () => {
    listContainer.innerHTML = "";
    const all = matchingEntries();

    if (all.length === 0) {
      const empty = document.createElement("p");
      empty.className = "lucky-store-empty";
      empty.textContent = "아직 등록된 지역 명당 정보가 없어요.";
      listContainer.appendChild(empty);
      if (moreBtn) {
        moreBtn.hidden = true;
        moreBtn.textContent = "";
      }
      return;
    }

    const visible = showAll ? all : all.slice(0, LUCKY_LIST_PAGE_SIZE);

    // 세로로 길어지지 않도록 한 줄짜리 순위 목록으로 표시한다.
    visible.forEach((entry, i) => {
      const item = document.createElement("div");
      item.className = "lucky-store-item";

      const rank = document.createElement("span");
      rank.className = "lucky-store-item-rank";
      rank.textContent = i + 1;
      item.appendChild(rank);

      const main = document.createElement("span");
      main.className = "lucky-store-item-main";
      const name = document.createElement("span");
      name.className = "lucky-store-item-name";
      name.textContent = entry.store.name;
      const region = document.createElement("span");
      region.className = "lucky-store-item-region";
      region.textContent = fullRegionLabel(entry.store);
      main.appendChild(name);
      main.appendChild(region);
      item.appendChild(main);

      if (entry.store.count || entry.store.count2) {
        const stats = document.createElement("span");
        stats.className = "lucky-store-item-count";
        const parts = [];
        if (entry.store.count) parts.push(`1등 ${entry.store.count}회`);
        if (entry.store.count2) parts.push(`2등 ${entry.store.count2}회`);
        stats.textContent = parts.join(" · ");
        item.appendChild(stats);
      }

      item.addEventListener("click", () => openStoreInfo(entry));
      listContainer.appendChild(item);
    });

    // 더보기로 펼친 뒤에도 다시 접을 수 있도록 버튼을 숨기지 않고 라벨만 바꾼다.
    if (moreBtn) {
      if (all.length <= LUCKY_LIST_PAGE_SIZE) {
        moreBtn.hidden = true;
        moreBtn.textContent = ""; // hidden이 어떤 이유로든 안 먹혀도 이전 지역의 텍스트가 안 남게
      } else {
        moreBtn.hidden = false;
        moreBtn.textContent = showAll ? "접기" : `더보기 (${all.length - LUCKY_LIST_PAGE_SIZE}곳 더)`;
      }
    }
  };

  function refreshCitySelect() {
    if (!citySelect) return;
    citySelect.innerHTML = "";
    const allOption = document.createElement("option");
    allOption.value = "전체";
    allOption.textContent = "전체";
    citySelect.appendChild(allOption);
    citiesForCurrentSido().forEach((city) => {
      const option = document.createElement("option");
      option.value = city;
      option.textContent = city;
      citySelect.appendChild(option);
    });
    citySelect.value = currentCity;
  }

  function apply() {
    showAll = false;
    fitToSelection();
    renderList();
  }

  function selectSido(sido) {
    currentSido = sido;
    currentCity = "전체";
    if (sidoSelect) sidoSelect.value = sido;
    refreshCitySelect();
    apply();
  }

  function selectCity(city) {
    currentCity = city;
    apply();
  }

  if (sidoSelect) {
    sidoSelect.innerHTML = "";
    LUCKY_REGIONS.forEach((region) => {
      const option = document.createElement("option");
      option.value = region;
      option.textContent = LUCKY_SIDO_FULL_NAME[region] || region;
      sidoSelect.appendChild(option);
    });
    sidoSelect.value = currentSido;
    sidoSelect.addEventListener("change", () => selectSido(sidoSelect.value));
  }

  if (citySelect) {
    citySelect.addEventListener("change", () => selectCity(citySelect.value));
  }

  if (moreBtn) {
    moreBtn.addEventListener("click", () => {
      showAll = !showAll;
      renderList();
    });
  }

  // keywordSearch를 한꺼번에 다 쏘면(20여 건) 카카오 쪽에서 일부 요청이 누락되는 경우가
  // 있어(요청량 폭주로 추정) 순서대로 하나씩 요청하고 응답을 받은 뒤 다음 요청을 보낸다.
  const searchOne = (store, i) =>
    new Promise((resolve) => {
      places.keywordSearch(store.query, (result, status) => {
        if (status === kakao.maps.services.Status.OK && result[0]) {
          const place = result[0];
          const pos = new kakao.maps.LatLng(place.y, place.x);
          const marker = new kakao.maps.Marker({ position: pos, title: store.name });
          const address = place.road_address_name || place.address_name || "";
          const entry = { marker, pos, store, address };
          entries[i] = entry;
          kakao.maps.event.addListener(marker, "click", () => openStoreInfo(entry));
        }
        resolve();
      });
    });

  (async () => {
    for (let i = 0; i < LUCKY_STORES.length; i++) {
      await searchOne(LUCKY_STORES[i], i);
    }
    refreshCitySelect();
    apply();
  })();
}
