# update-full-stores.ps1의 병합 단계만 따로 떼어낸 스크립트.
# 사이트 차단 등으로 수집이 중간에 멈췄을 때, 이미 모은 청크만으로 우선 병합할 때 쓴다.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$chunksDir = Join-Path $root "data\full-store-chunks"

Write-Host "=== 병합 시작 ==="
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
