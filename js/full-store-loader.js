/* ---------- 전국 판매점 데이터 로더 ----------
   data/full-stores/index.js(작음, 목록만) + shard-NN.js(각각 최대 수백KB) 여러 개로
   나눠져 있다. index.js는 <script>로 미리 로드해두고(FULL_STORE_DATA=[], FULL_STORE_SHARDS
   목록만 들어있음), 지도를 확대해서 실제로 필요해지는 시점에 이 로더로 나머지 샤드를
   순차적으로 fetch+실행해 FULL_STORE_DATA를 채운다. 한 번 로드하면 페이지를 새로
   불러오기 전까지 다시 받지 않는다. */

let _fullStoreLoadPromise = null;

function loadFullStoreScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`샤드 로드 실패: ${src}`));
    document.head.appendChild(s);
  });
}

function loadAllFullStoreShards() {
  if (_fullStoreLoadPromise) return _fullStoreLoadPromise;

  _fullStoreLoadPromise = (async () => {
    if (typeof FULL_STORE_SHARDS === "undefined" || FULL_STORE_SHARDS.length === 0) {
      return;
    }
    for (let i = 0; i < FULL_STORE_SHARDS.length; i++) {
      await loadFullStoreScript(`data/full-stores/${FULL_STORE_SHARDS[i]}`);
    }
  })();

  return _fullStoreLoadPromise;
}
