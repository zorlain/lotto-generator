# 동행복권 공식 "복권 판매점 찾기" 내부 API(prchsplcsrch/selectLtShp.do)를 이용해
# 전국 로또6/45 · 연금복권720+ 판매점 전체를 수집한다. 인증 불필요, 순수 GET.
#
# selectAdmdst.do(시/군/구 목록 조회)는 일부 시/도에서 최신 행정구역명이 아니라
# 예전 명칭/통합 명칭을 써야 한다(사이트 자체 select box의 value 속성 확인 결과):
#   강원특별자치도 -> "강원도", 전북특별자치도 -> "전라북도",
#   전라남도+광주광역시 -> "전남광주통합특별시"(둘이 하나로 통합됨), 세종은 하위 구역 없음.
# 반면 selectLtShp.do(실제 판매점 검색)는 짧은 약칭을 쓴다: 서울,경기,인천,강원,충북,충남,
# 대전,세종,전북,전남광주(전남+광주 통합 약칭, 개별 "전남"/"광주"는 안 먹힘),경북,경남,대구,
# 부산,울산,제주. 세종은 시/군/구 없이 빈 값으로 조회한다.
#
# 결과는 시/군/구별 청크 파일(data/full-store-chunks/{시도}_{시군구}.json)로 즉시 저장해
# 중단 후 재시작 가능하게 한다(이미 있는 파일은 건너뜀).

param(
  [switch]$SkipMerge
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$chunksDir = Join-Path $root "data\full-store-chunks"
if (-not (Test-Path $chunksDir)) { New-Item -ItemType Directory -Path $chunksDir | Out-Null }

$headers = @{ "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }

Add-Type -AssemblyName System.Web.Extensions
$serializer = New-Object System.Web.Script.Serialization.JavaScriptSerializer
$serializer.MaxJsonLength = [int]::MaxValue

# admdst 조회용 시/도 전체명(특이 케이스 포함) -> selectLtShp 조회용 짧은 약칭
$sidoMap = [ordered]@{
  "서울특별시"         = "서울"
  "경기도"             = "경기"
  "인천광역시"         = "인천"
  "강원도"             = "강원"
  "충청북도"           = "충북"
  "충청남도"           = "충남"
  "대전광역시"         = "대전"
  "전라북도"           = "전북"
  "전남광주통합특별시" = "전남광주"
  "경상북도"           = "경북"
  "경상남도"           = "경남"
  "대구광역시"         = "대구"
  "부산광역시"         = "부산"
  "울산광역시"         = "울산"
  "제주특별자치도"     = "제주"
}

function Get-SggList {
  param([string]$fullSidoName)
  $url = "https://www.dhlottery.co.kr/prchsplcsrch/selectAdmdst.do?srchCtpvNm=" + [uri]::EscapeDataString($fullSidoName)
  $resp = Invoke-WebRequest -Uri $url -Headers $headers -UseBasicParsing -TimeoutSec 20
  $json = $serializer.DeserializeObject($resp.Content)
  $list = $json["data"]["list"]
  $names = New-Object System.Collections.Generic.List[string]
  foreach ($row in $list) {
    if ($row -and $row["sggNm"]) { $names.Add($row["sggNm"]) }
  }
  return $names
}

function Get-StorePage {
  param([string]$shortSido, [string]$sgg, [int]$pageNum)
  $url = "https://www.dhlottery.co.kr/prchsplcsrch/selectLtShp.do?pageNum=$pageNum&recordCountPerPage=10" +
    "&srchCtpvNm=" + [uri]::EscapeDataString($shortSido) + "&srchSggNm=" + [uri]::EscapeDataString($sgg)
  $resp = Invoke-WebRequest -Uri $url -Headers $headers -UseBasicParsing -TimeoutSec 20
  return $serializer.DeserializeObject($resp.Content)
}

Write-Host "=== 시/군/구 목록 조회 ==="
$targets = New-Object System.Collections.Generic.List[object]
foreach ($full in $sidoMap.Keys) {
  $short = $sidoMap[$full]
  $sggList = Get-SggList -fullSidoName $full
  if ($sggList.Count -eq 0) {
    # 세종처럼 하위 시/군/구가 없는 경우 빈 값으로 통짜 조회
    $targets.Add([pscustomobject]@{ Short = $short; Sgg = "" })
  } else {
    foreach ($sgg in $sggList) {
      $targets.Add([pscustomobject]@{ Short = $short; Sgg = $sgg })
    }
  }
  Write-Host "  $full ($short) : $($sggList.Count)개 시/군/구"
  Start-Sleep -Milliseconds 150
}
# 세종은 admdst 목록 자체에 없으므로(별도 시/도로 안 뜸) 수동 추가
$targets.Add([pscustomobject]@{ Short = "세종"; Sgg = "" })
Write-Host "총 조회 대상: $($targets.Count)개 지역"

Write-Host "=== 판매점 수집 시작 ==="
$idx = 0
foreach ($t in $targets) {
  $idx++
  $safeSgg = if ($t.Sgg) { $t.Sgg } else { "전체" }
  $chunkPath = Join-Path $chunksDir "$($t.Short)_$safeSgg.json"
  if (Test-Path $chunkPath) {
    Write-Host "[$idx/$($targets.Count)] $($t.Short) $safeSgg - 이미 있음, 건너뜀"
    continue
  }

  try {
    $first = Get-StorePage -shortSido $t.Short -sgg $t.Sgg -pageNum 1
    $total = [int]$first["data"]["total"]
    $allStores = New-Object System.Collections.Generic.List[object]
    foreach ($row in $first["data"]["list"]) { $allStores.Add($row) }

    $pageCount = [math]::Ceiling($total / 10.0)
    for ($p = 2; $p -le $pageCount; $p++) {
      Start-Sleep -Milliseconds 120
      $page = Get-StorePage -shortSido $t.Short -sgg $t.Sgg -pageNum $p
      foreach ($row in $page["data"]["list"]) { $allStores.Add($row) }
    }

    # 필요한 필드만 뽑아서 저장(용량 절약)
    $compact = $allStores | ForEach-Object {
      [pscustomobject]@{
        n  = $_["conmNm"]
        a  = $_["bplcRdnmDaddr"]
        la = $_["shpLat"]
        lo = $_["shpLot"]
        l  = $_["l645LtNtslYn"]
        p  = $_["pt720NtslYn"]
      }
    }
    $json = $compact | ConvertTo-Json -Compress -Depth 4
    [System.IO.File]::WriteAllText($chunkPath, $json, [System.Text.UTF8Encoding]::new($false))
    Write-Host "[$idx/$($targets.Count)] $($t.Short) $safeSgg - $($allStores.Count)/$total 개 저장"
  } catch {
    Write-Host "[$idx/$($targets.Count)] $($t.Short) $safeSgg - 오류: $($_.Exception.Message)"
  }
  Start-Sleep -Milliseconds 150
}

Write-Host "=== 수집 완료 ==="

if ($SkipMerge) { return }

Write-Host "=== 병합 시작 ==="
# 광주 구(5개)만 따로 광주로, 나머지 전남광주 청크는 전남으로 분류
$gwangjuGu = @("광산구", "남구", "동구", "북구", "서구")

$allRecords = New-Object System.Collections.Generic.List[object]
Get-ChildItem $chunksDir -Filter "*.json" | ForEach-Object {
  $parts = $_.BaseName -split "_", 2
  $short = $parts[0]
  $sgg = $parts[1]
  $sido = $short
  if ($short -eq "전남광주") {
    $sido = if ($gwangjuGu -contains $sgg) { "광주" } else { "전남" }
  }
  try {
    $rows = Get-Content $_.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($r in $rows) {
      $allRecords.Add([pscustomobject]@{
        n  = $r.n
        a  = $r.a
        c  = $sgg
        s  = $sido
        la = $r.la
        lo = $r.lo
        l  = $r.l
        p  = $r.p
      })
    }
  } catch {
    Write-Host "  경고: $($_.Name) 파싱 실패"
  }
}
Write-Host "총 판매점: $($allRecords.Count)개"

$outDir = Join-Path $root "data\full-stores"
if (Test-Path $outDir) { Remove-Item $outDir -Recurse -Force }
New-Item -ItemType Directory -Path $outDir | Out-Null

$shardSize = 2000
$shardCount = [math]::Ceiling($allRecords.Count / $shardSize)
$shardNames = New-Object System.Collections.Generic.List[string]
for ($s = 0; $s -lt $shardCount; $s++) {
  $shardName = "shard-{0:D2}.js" -f $s
  $shardRecords = $allRecords | Select-Object -Skip ($s * $shardSize) -First $shardSize
  $shardJson = $shardRecords | ConvertTo-Json -Compress -Depth 4
  # 단일 레코드일 때 배열 축약되는 PowerShell 5.1 버그 방지
  if ($shardRecords.Count -eq 1) { $shardJson = "[$shardJson]" }
  $out = "// 전국 로또/연금복권 판매점 데이터 샤드. scripts/update-full-stores.ps1 로 갱신.`nFULL_STORE_DATA.push(...$shardJson);`n"
  [System.IO.File]::WriteAllText((Join-Path $outDir $shardName), $out, [System.Text.UTF8Encoding]::new($false))
  $shardNames.Add($shardName)
  Write-Host "  $shardName : $($shardRecords.Count)개"
}

$shardNamesJson = "[" + (($shardNames | ForEach-Object { "`"$_`"" }) -join ",") + "]"
$indexOut = "// 전국 판매점 샤드 목록 + 메타데이터. scripts/update-full-stores.ps1 로 갱신.`n" +
  "// n=상호명 a=도로명주소 c=시군구 s=시도(약칭) la=위도 lo=경도 l=로또645판매Y/N p=연금복권720판매Y/N`n" +
  "const FULL_STORE_SHARDS = $shardNamesJson;`n" +
  "const FULL_STORE_TOTAL = $($allRecords.Count);`n" +
  "const FULL_STORE_UPDATED = `"$((Get-Date).ToString('yyyy-MM-dd'))`";`n" +
  "const FULL_STORE_DATA = [];`n"
[System.IO.File]::WriteAllText((Join-Path $outDir "index.js"), $indexOut, [System.Text.UTF8Encoding]::new($false))

Write-Host "=== 병합 완료: $outDir ==="
