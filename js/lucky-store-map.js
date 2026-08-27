/* ---------- 로또 명당 지도 (카카오맵) ----------
   카카오맵 SDK는 <script ... autoload=false>로 불러오고, kakao.maps.load()로 준비 완료
   시점을 잡는다. 로또/연금복권 두 게임 패널이 각자 initLuckyStoreMap을 호출해도
   kakao.maps.load 콜백 등록은 한 번만 하도록 kakaoReady()로 프라미스를 공유한다.
   지도 탭이 처음엔 hidden 상태라 그 안에서 바로 지도를 만들면 크기가 0으로 잡혀 깨지므로,
   "데이터 통계" 탭을 처음 열 때(레이아웃이 잡힌 뒤) 지연 생성한다.

   장소 검색(키워드 검색)은 페이지당 한 번만 전체 목록에 대해 수행하고, 그 결과(좌표 +
   도로명/지번 주소)를 캐싱해둔다. 지역 필터를 눌러도 재검색하지 않고 마커를
   보이기/숨기기만 해서 API 호출을 아낀다. */

/* 지도가 속한 "데이터 통계" 탭을 처음 열 때만 지도를 생성한다(게임 패널마다 버튼이
   따로 있으므로 rootId로 범위를 좁혀 그 안의 버튼만 찾는다). */
function setupLuckyStoreMapLazyInit(rootId, mapId, listId, regionsId) {
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
    setTimeout(() => initLuckyStoreMap(mapId, listId, regionsId), 0);
  });
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

  const addrRow = document.createElement("div");
  addrRow.className = "lucky-store-infowindow-addr-row";

  const addrText = document.createElement("span");
  addrText.className = "lucky-store-infowindow-addr";
  addrText.textContent = entry.address || entry.store.region;
  addrRow.appendChild(addrText);

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "lucky-store-copy-btn";
  copyBtn.textContent = "📋";
  copyBtn.title = "주소 복사";
  copyBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const ok = await copyToClipboard(entry.address || entry.store.region);
    if (ok) flashCopied(copyBtn, "✅");
  });
  addrRow.appendChild(copyBtn);

  wrap.appendChild(addrRow);
  return wrap;
}

async function initLuckyStoreMap(mapId, listId, regionsId) {
  const mapContainer = document.getElementById(mapId);
  const listContainer = document.getElementById(listId);
  const regionsContainer = regionsId ? document.getElementById(regionsId) : null;
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
  let pending = LUCKY_STORES.length;
  let currentRegion = "전국";

  // 창 크기가 바뀌어도(모바일 회전 등) 카카오맵은 자동으로 다시 맞추지 않으므로
  // 컨테이너 크기 변화를 감지해 relayout + 현재 지역 범위 재조정을 해준다.
  let resizeTimer = null;
  const resizeObserver = new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      map.relayout();
      fitToRegion(currentRegion);
    }, 150);
  });
  resizeObserver.observe(mapContainer);

  const openStoreInfo = (entry) => {
    infoWindow.setContent(buildLuckyStoreInfoContent(entry));
    infoWindow.open(map, entry.marker);
    map.panTo(entry.pos);
  };

  function entriesForRegion(region) {
    return entries.filter((e) => e && (region === "전국" || e.store.sido === region));
  }

  function fitToRegion(region) {
    const visible = entriesForRegion(region);
    visible.forEach((e) => e.marker.setMap(map));
    entries.forEach((e) => {
      if (e && !visible.includes(e)) e.marker.setMap(null);
    });

    if (visible.length === 0) {
      infoWindow.close();
      return;
    }
    if (visible.length === 1) {
      map.setCenter(visible[0].pos);
      map.setLevel(6);
      return;
    }
    const bounds = new kakao.maps.LatLngBounds();
    visible.forEach((e) => bounds.extend(e.pos));
    map.setBounds(bounds);
  }

  const renderList = () => {
    listContainer.innerHTML = "";
    const visible = entriesForRegion(currentRegion);

    if (visible.length === 0) {
      const empty = document.createElement("p");
      empty.className = "lucky-store-empty";
      empty.textContent = "아직 등록된 지역 명당 정보가 없어요.";
      listContainer.appendChild(empty);
      return;
    }

    visible.forEach((entry) => {
      const item = document.createElement("div");
      item.className = "lucky-store-item";

      const head = document.createElement("div");
      head.className = "lucky-store-item-head";
      const name = document.createElement("span");
      name.className = "lucky-store-item-name";
      name.textContent = entry.store.name;
      const region = document.createElement("span");
      region.className = "lucky-store-item-region";
      region.textContent = entry.store.region;
      head.appendChild(name);
      head.appendChild(region);
      item.appendChild(head);

      item.addEventListener("click", () => openStoreInfo(entry));
      listContainer.appendChild(item);
    });
  };

  function selectRegion(region) {
    currentRegion = region;
    if (regionsContainer) {
      regionsContainer.querySelectorAll(".lucky-store-region-btn").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.region === region);
      });
    }
    fitToRegion(region);
    renderList();
  }

  if (regionsContainer) {
    regionsContainer.innerHTML = "";
    LUCKY_REGIONS.forEach((region) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "lucky-store-region-btn";
      if (region === currentRegion) btn.classList.add("active");
      btn.dataset.region = region;
      btn.textContent = region;
      btn.addEventListener("click", () => selectRegion(region));
      regionsContainer.appendChild(btn);
    });
  }

  LUCKY_STORES.forEach((store, i) => {
    places.keywordSearch(store.query, (result, status) => {
      pending--;
      if (status === kakao.maps.services.Status.OK && result[0]) {
        const place = result[0];
        const pos = new kakao.maps.LatLng(place.y, place.x);
        const marker = new kakao.maps.Marker({ position: pos, title: store.name });
        const address = place.road_address_name || place.address_name || "";
        const entry = { marker, pos, store, address };
        entries[i] = entry;
        kakao.maps.event.addListener(marker, "click", () => openStoreInfo(entry));
      }

      if (pending === 0) {
        selectRegion("전국");
      }
    });
  });
}
