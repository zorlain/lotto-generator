/* ---------- 로또 명당 지도 (카카오맵) ----------
   카카오맵 SDK는 <script ... autoload=false>로 불러오고, kakao.maps.load()로 준비 완료
   시점을 잡는다. 로또/연금복권 두 게임 패널이 각자 initLuckyStoreMap을 호출해도
   kakao.maps.load 콜백 등록은 한 번만 하도록 kakaoReady()로 프라미스를 공유한다.
   지도 탭이 처음엔 hidden 상태라 그 안에서 바로 지도를 만들면 크기가 0으로 잡혀 깨지므로,
   "데이터 통계" 탭을 처음 열 때(레이아웃이 잡힌 뒤) 지연 생성한다. */

/* 지도가 속한 "데이터 통계" 탭을 처음 열 때만 지도를 생성한다(게임 패널마다 버튼이
   따로 있으므로 rootId로 범위를 좁혀 그 안의 버튼만 찾는다). */
function setupLuckyStoreMapLazyInit(rootId, mapId, listId) {
  const root = document.getElementById(rootId);
  if (!root) return;
  const btn = root.querySelector('[data-tab="stats"]');
  if (!btn) return;
  let started = false;
  btn.addEventListener("click", () => {
    if (started) return;
    started = true;
    requestAnimationFrame(() => initLuckyStoreMap(mapId, listId));
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

async function initLuckyStoreMap(mapId, listId) {
  const mapContainer = document.getElementById(mapId);
  const listContainer = document.getElementById(listId);
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
  const bounds = new kakao.maps.LatLngBounds();

  // 창 크기가 바뀌어도(모바일 회전 등) 카카오맵은 자동으로 다시 맞추지 않으므로
  // 컨테이너 크기 변화를 감지해 relayout + 마커 범위 재조정을 해준다.
  let resizeTimer = null;
  const resizeObserver = new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      map.relayout();
      if (!bounds.isEmpty()) map.setBounds(bounds);
    }, 150);
  });
  resizeObserver.observe(mapContainer);
  const infoWindow = new kakao.maps.InfoWindow({ zIndex: 1 });
  const entries = new Array(LUCKY_STORES.length);
  let pending = LUCKY_STORES.length;

  const openStoreInfo = (entry) => {
    infoWindow.setContent(
      `<div style="padding:8px 10px;font-size:12.5px;line-height:1.5;">
        <b>${entry.store.name}</b><br/>${entry.store.region}
      </div>`
    );
    infoWindow.open(map, entry.marker);
    map.panTo(entry.pos);
  };

  const renderList = () => {
    listContainer.innerHTML = "";
    LUCKY_STORES.forEach((store, i) => {
      const entry = entries[i];

      const item = document.createElement("div");
      item.className = "lucky-store-item";
      if (!entry) item.classList.add("lucky-store-item-unmapped");

      const head = document.createElement("div");
      head.className = "lucky-store-item-head";
      const name = document.createElement("span");
      name.className = "lucky-store-item-name";
      name.textContent = store.name;
      const region = document.createElement("span");
      region.className = "lucky-store-item-region";
      region.textContent = store.region;
      head.appendChild(name);
      head.appendChild(region);

      const note = document.createElement("div");
      note.className = "lucky-store-item-note";
      note.textContent = store.note;

      item.appendChild(head);
      item.appendChild(note);

      if (entry) {
        item.addEventListener("click", () => openStoreInfo(entry));
      }
      listContainer.appendChild(item);
    });
  };

  LUCKY_STORES.forEach((store, i) => {
    places.keywordSearch(store.query, (result, status) => {
      pending--;
      if (status === kakao.maps.services.Status.OK && result[0]) {
        const pos = new kakao.maps.LatLng(result[0].y, result[0].x);
        const marker = new kakao.maps.Marker({ map, position: pos, title: store.name });
        const entry = { marker, pos, store };
        entries[i] = entry;
        bounds.extend(pos);
        kakao.maps.event.addListener(marker, "click", () => openStoreInfo(entry));
      }

      if (pending === 0) {
        if (!bounds.isEmpty()) map.setBounds(bounds);
        renderList();
      }
    });
  });
}
