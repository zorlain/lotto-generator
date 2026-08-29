// 전국 판매점 샤드 목록 + 메타데이터. scripts/update-full-stores.ps1 로 갱신.
// n=상호명 a=도로명주소 c=시군구 s=시도(약칭) la=위도 lo=경도 l=로또645판매Y/N p=연금복권720판매Y/N
const FULL_STORE_SHARDS = ["shard-00.js","shard-01.js","shard-02.js","shard-03.js","shard-04.js","shard-05.js","shard-06.js"];
const FULL_STORE_TOTAL = 12163;
const FULL_STORE_UPDATED = "2026-08-30";
const FULL_STORE_DATA = [];
