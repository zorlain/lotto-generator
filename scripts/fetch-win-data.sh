#!/bin/bash
# 동행복권 공식 사이트 API에서 회차별 당첨 결과와 당첨 판매점 기록을 받아 raw 폴더에 저장한다.
#
# 사이트에 부담을 주지 않도록 한 번에 하나씩 천천히(기본 2초 간격) 받는다. 빠르게 여러 개를 동시에
# 보내면 사이트가 한동안(약 30분) 응답하지 않는다. 이미 받은 파일은 건너뛰므로 중단 후 다시 실행해도 된다.
# 받는 순서: 로또 회차별 결과 → 로또 1등 판매점 → 연금복권(결과·인원·1등·2등 판매점) → 로또 2등 판매점
# (로또 2등 판매점 목록은 한 회차에 100곳 안팎이라 응답이 커서 마지막에 받는다. SKIP_RANK2=1 이면 받지 않는다.)
#
# 사용법: bash scripts/fetch-win-data.sh <raw 폴더> <최신 로또 회차> <최신 연금복권 회차>
RAW="${1:?raw 폴더}"; LAST_L="${2:?로또 최신 회차}"; LAST_P="${3:?연금복권 최신 회차}"
B=https://www.dhlottery.co.kr
DELAY="${DELAY:-2}"
FAILS=0
mkdir -p "$RAW"
ok(){ [ -s "$1" ] && grep -q '"data"' "$1" && [ "$(tail -c 2 "$1" | tr -d '\r\n ')" = "}}" ]; }
get(){ # get <파일> <URL>
  ok "$1" && return 0
  for i in 1 2 3; do
    curl -s -m 40 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" "$2" -o "$1.tmp"
    if ok "$1.tmp"; then mv "$1.tmp" "$1"; FAILS=0; sleep "$DELAY"; return 0; fi
    sleep $((i*10))
  done
  rm -f "$1.tmp"; echo "FAIL $1" >&2
  FAILS=$((FAILS+1))
  if [ "$FAILS" -ge 4 ]; then echo "연속 실패 4회: 사이트가 응답하지 않아 중단합니다. 30분쯤 뒤 다시 실행하세요." >&2; exit 1; fi
  return 1
}
echo "로또 회차별 결과"
for r in $(seq 1 "$LAST_L"); do get "$RAW/lp_$r.json" "$B/lt645/selectPstLt645Info.do?srchLtEpsd=$r"; done
echo "로또 1등 판매점"
for r in $(seq 262 "$LAST_L"); do
  get "$RAW/ls1_$r.json" "$B/wnprchsplcsrch/selectLtWnShp.do?srchWnShpRnk=1&srchLtEpsd=$r&pageNum=1&recordCountPerPage=300"
done
echo "연금복권"
for r in $(seq 1 "$LAST_P"); do
  get "$RAW/pp_$r.json" "$B/pt720/selectPstPt720Info.do?srchPsltEpsd=$r"
  get "$RAW/pw_$r.json" "$B/pt720/selectPstPt720WnInfo.do?srchPsltEpsd=$r"
  get "$RAW/ps1_$r.json" "$B/wnprchsplcsrch/selectPtWnShp.do?srchWnShpRnk=1&srchLtEpsd=$r&pageNum=1&recordCountPerPage=300"
  get "$RAW/ps2_$r.json" "$B/wnprchsplcsrch/selectPtWnShp.do?srchWnShpRnk=2&srchLtEpsd=$r&pageNum=1&recordCountPerPage=300"
done
if [ -z "$SKIP_RANK2" ]; then
  echo "로또 2등 판매점"
  for r in $(seq 262 "$LAST_L"); do
    get "$RAW/ls2_$r.json" "$B/wnprchsplcsrch/selectLtWnShp.do?srchWnShpRnk=2&srchLtEpsd=$r&pageNum=1&recordCountPerPage=300"
  done
fi
echo "수집 끝"
