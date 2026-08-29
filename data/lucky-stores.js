// 여러 매체(뉴스·복권 통계 사이트 등)에서 로또 1등 배출 판매점("명당")으로 보도된 목록.
// 정확한 위치는 카카오맵 장소 검색으로 표시하며, 상호명이 흔해 다른 장소가 잡힐 수 있는 항목은
// query에 주소를 넣어 정확도를 높였다. sido는 지역 필터링에 쓰는 시/도 단위 구분.
// count는 보도에서 확인된 1등 배출 횟수(있는 경우만). 매체마다 집계 기준·시점이 달라
// 참고용 수치이며, 지역별로 이 값이 높은 곳들을 우선 담았다.
// 당첨은 완전히 무작위이며 특정 판매점 방문이 확률을 높이지 않는다.
const LUCKY_REGIONS = [
  "전국", "서울", "경기", "인천", "강원", "충북", "충남", "대전", "세종",
  "전북", "전남", "광주", "경북", "경남", "대구", "부산", "울산", "제주",
];

const LUCKY_STORES = [
  { name: "스파", query: "서울 노원구 동일로 1493 주공10단지종합상가", region: "서울 노원구", sido: "서울", count: 48 },
  { name: "잠실매점", query: "서울 송파구 올림픽로 269", region: "서울 송파구", sido: "서울", count: 20 },
  { name: "오케이상사", query: "서울 서초구 신반포로 176 센트럴시티", region: "서울 서초구", sido: "서울", count: 16 },
  { name: "제이복권방", query: "서울 종로구 종로 225-1 평창빌딩", region: "서울 종로구", sido: "서울", count: 16 },
  { name: "묵동식품", query: "서울 중랑구 동일로 919", region: "서울 중랑구", sido: "서울", count: 14 },
  { name: "드림", query: "서울 서대문구 증가로 247", region: "서울 서대문구", sido: "서울", count: 2 },

  { name: "로또휴게실", query: "경기 용인시 기흥구 용구대로 1885", region: "경기 용인시", sido: "경기", count: 27 },
  { name: "다니엘사", query: "경기 안산시 단원구 원선1로 38", region: "경기 안산시", sido: "경기", count: 15 },
  { name: "복권백화점", query: "경기 파주시 평화로 70", region: "경기 파주시", sido: "경기", count: 15 },
  { name: "탑복권", query: "경기 성남시 분당구 성남대로 926", region: "경기 성남시", sido: "경기" },
  { name: "이마트24 백석동문점", query: "경기 고양시 일산동구 호수로 358-26", region: "경기 고양시", sido: "경기" },
  { name: "바로전산", query: "경기 광명시 오리로 1000", region: "경기 광명시", sido: "경기" },

  { name: "복권라이프마트", query: "인천 중구 연안부두로53번길 36", region: "인천 중구", sido: "인천", count: 12 },
  { name: "노다지복권방", query: "인천 미추홀구 한나루로 400", region: "인천 미추홀구", sido: "인천", count: 11 },
  { name: "대박천하마트", query: "인천 부평구 굴포로 48", region: "인천 부평구", sido: "인천", count: 10 },
  { name: "복권전문점", query: "인천 부평구 원적로 437", region: "인천 부평구", sido: "인천", count: 9 },
  { name: "나라복권", query: "인천 남동구 인주대로676번길 22", region: "인천 남동구", sido: "인천" },

  { name: "흥양마중물", query: "흥양마중물", region: "강원 원주시", sido: "강원", count: 6 },
  { name: "주택복권방", query: "강원 원주시 우산초교길 29", region: "강원 원주시", sido: "강원", count: 5 },
  { name: "복권나라(원주)", query: "강원 원주시 평원로 23", region: "강원 원주시", sido: "강원", count: 3 },
  { name: "속초복권샵", query: "강원 속초시 청학동 486-42", region: "강원 속초시", sido: "강원" },

  { name: "동남운천복권", query: "충북 청주시 상당구 중고개로125번길 17", region: "충북 청주시", sido: "충북", count: 2 },
  { name: "썬마트", query: "충북 청주시 흥덕구", region: "충북 청주시", sido: "충북", count: 5 },
  { name: "복앤돈복권방", query: "충북 충주시 충원대로 948", region: "충북 충주시", sido: "충북" },
  { name: "럭키뱅크복권방", query: "충북 청주시 서원구 청남로 2092-1", region: "충북 청주시", sido: "충북" },

  { name: "로또명당인주점", query: "충남 아산시 인주면", region: "충남 아산시", sido: "충남", count: 9 },
  { name: "대박마트복권방", query: "충남 아산시 음봉면", region: "충남 아산시", sido: "충남", count: 5 },
  { name: "로또복권두정점", query: "충남 천안시 서북구", region: "충남 천안시", sido: "충남", count: 5 },
  { name: "황실복권방", query: "충남 천안시 동남구", region: "충남 천안시", sido: "충남", count: 5 },
  { name: "태안로또복권방", query: "충남 태안군 독샘로 57", region: "충남 태안군", sido: "충남", count: 2 },

  { name: "금빛로또방", query: "대전 중구 계룡로 880", region: "대전 중구", sido: "대전" },
  { name: "온천로또방", query: "대전 유성구 계룡로 92", region: "대전 유성구", sido: "대전", count: 4 },
  { name: "GS25 대전시네마점", query: "대전 서구 괴정동", region: "대전 서구", sido: "대전", count: 5 },

  { name: "조치원복권방", query: "세종 조치원읍 원리 9-20", region: "세종 조치원읍", sido: "세종" },

  { name: "또또복권방", query: "전북 익산시 영등동", region: "전북 익산시", sido: "전북", count: 5 },
  { name: "행운복권방", query: "전북 익산시 부송동", region: "전북 익산시", sido: "전북", count: 5 },
  { name: "팡팡복권마트", query: "전북 전주시 덕진구", region: "전북 전주시", sido: "전북", count: 5 },
  { name: "춘향로또", query: "전북 남원시 동림로 102-1", region: "전북 남원시", sido: "전북" },

  { name: "알리바이(나주점)", query: "알리바이 나주점", region: "전남 나주시", sido: "전남", count: 13 },
  { name: "대광복권방", query: "전남 화순군 칠충로 55", region: "전남 화순군", sido: "전남", count: 9 },
  { name: "이마트24 순천산단점", query: "전남 순천시 산단1길 6", region: "전남 순천시", sido: "전남", count: 8 },
  { name: "종합복권방", query: "전남 해남군 해남읍 해리 189-2", region: "전남 해남군", sido: "전남", count: 8 },
  { name: "복권나라(여수)", query: "전남 여수시 중앙로 62", region: "전남 여수시", sido: "전남", count: 5 },

  { name: "오천억복권방", query: "광주 서구 화정동 782-14", region: "광주 서구", sido: "광주", count: 16 },
  { name: "알리바이(광주)", query: "광주 광산구 신가동", region: "광주 광산구", sido: "광주", count: 9 },
  { name: "일등복권판매점", query: "광주 북구 설죽로315번길 40", region: "광주 북구", sido: "광주" },
  { name: "복권세상", query: "광주 광산구 무진대로231번길 28", region: "광주 광산구", sido: "광주" },

  { name: "CU노서점", query: "경북 경주시 노서동", region: "경북 경주시", sido: "경북", count: 8 },
  { name: "NG24", query: "경북 칠곡군 석적읍", region: "경북 칠곡군", sido: "경북", count: 5 },
  { name: "로터리편의마트", query: "경북 포항시 북구", region: "경북 포항시", sido: "경북", count: 5 },
  { name: "행운의집", query: "경북 안동시 북문동", region: "경북 안동시", sido: "경북", count: 5 },
  { name: "동네복권", query: "경북 울진군 울진중앙로 27", region: "경북 울진군", sido: "경북" },

  { name: "GS25 양산혜인점", query: "GS25 양산혜인점", region: "경남 양산시", sido: "경남", count: 11 },
  { name: "목화휴게소", query: "경남 사천시 용현면", region: "경남 사천시", sido: "경남", count: 9 },
  { name: "북마산복권전문점", query: "경남 창원시 마산합포구", region: "경남 창원시", sido: "경남", count: 6 },
  { name: "구산복권방", query: "경남 김해시 구산동", region: "경남 김해시", sido: "경남", count: 5 },
  { name: "리이지복권", query: "경남 창원시 성산구 동산로 156", region: "경남 창원시", sido: "경남" },

  { name: "일등복권편의점", query: "대구 달서구 본리동", region: "대구 달서구", sido: "대구", count: 12 },
  { name: "세진전자통신", query: "대구 서구 평리동", region: "대구 서구", sido: "대구", count: 9 },
  { name: "복권명당(서부점)", query: "대구 달서구 송현동", region: "대구 달서구", sido: "대구", count: 6 },
  { name: "나눔Lotto 메트로센터점", query: "나눔Lotto 메트로센터점", region: "대구 중구", sido: "대구", count: 4 },
  { name: "천하명당", query: "대구 북구 읍내동 천하명당 로또", region: "대구 북구", sido: "대구", count: 4 },
  { name: "GS25 대구교대점", query: "GS25 대구교대점", region: "대구 남구", sido: "대구" },
  { name: "로또명당 경대북문점", query: "대구 북구 대동로 43-1", region: "대구 북구", sido: "대구" },

  { name: "부일카서비스", query: "부산 동구 자성로133번길 35", region: "부산 동구", sido: "부산", count: 50 },
  { name: "뉴빅마트", query: "부산 기장군 정관중앙로 48", region: "부산 기장군", sido: "부산", count: 30 },
  { name: "돈벼락맞는곳", query: "부산 동구 조방로49번길 18-1", region: "부산 동구", sido: "부산", count: 14 },
  { name: "사하상회", query: "부산 사하구 낙동대로 256-1", region: "부산 사하구", sido: "부산" },
  { name: "천하제일명당", query: "부산 부산진구 골드테마길 42", region: "부산 부산진구", sido: "부산" },

  { name: "영화유통(1등복권방)", query: "울산 남구 달동", region: "울산 남구", sido: "울산", count: 7 },
  { name: "아이러브마트복권방", query: "울산 중구 태화동", region: "울산 중구", sido: "울산", count: 6 },
  { name: "한꿈복권방", query: "울산 중구 번영로 586", region: "울산 중구", sido: "울산" },

  { name: "제주대림점", query: "제주 제주시 과원북2길 48", region: "제주 제주시", sido: "제주", count: 5 },
  { name: "신세계 제주", query: "제주 제주시 고마로14길 7", region: "제주 제주시", sido: "제주", count: 4 },
  { name: "본스튜디오 제주", query: "제주 제주시 하귀로 111", region: "제주 제주시", sido: "제주", count: 4 },
];
