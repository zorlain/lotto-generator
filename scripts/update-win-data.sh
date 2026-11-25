#!/bin/bash
# 새 회차가 나온 뒤 당첨금·당첨 판매점 데이터를 갱신한다.
#   1) data/lotto-data.js, data/pension-data.js 의 최신 회차까지 부족한 원본 JSON만 동행복권에서 받는다
#      (이미 받은 회차는 건너뛰므로 평소엔 새 회차분 몇십 건만 받는다)
#   2) scripts/build-win-data.pl 로 data/lotto-prizes.js, pension-prizes.js, win-stores-*.js 를 다시 만든다
# 판매점의 폐점 여부는 받은 시점 기준이라, 가끔(예: 달에 한 번) 1등 판매점 원본을 지우고 다시 받으려면
#   REFRESH_RANK1=1 bash scripts/update-win-data.sh
# 사용법(프로젝트 루트 또는 어디서든): bash scripts/update-win-data.sh
cd "$(dirname "$0")/.." || exit 1
RAW="${RAW:-data-raw}"
LAST_L=$(grep -o '"no":[0-9]*' data/lotto-data.js | tail -1 | grep -o '[0-9]*$')
LAST_P=$(grep -o '"no":[0-9]*' data/pension-data.js | tail -1 | grep -o '[0-9]*$')
echo "로또 최신 ${LAST_L}회, 연금복권 최신 ${LAST_P}회"
mkdir -p "$RAW"
if [ -n "$REFRESH_RANK1" ]; then rm -f "$RAW"/ls1_*.json "$RAW"/ps1_*.json; fi
bash scripts/fetch-win-data.sh "$RAW" "$LAST_L" "$LAST_P" && perl scripts/build-win-data.pl "$RAW"
