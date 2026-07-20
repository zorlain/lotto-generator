# 최신 회차가 추가됐을 때 데이터를 다시 받아오는 스크립트
# 사용법: powershell -File scripts/update-data.ps1
# 출처: https://github.com/smok95/lotto (1회~최신회차 당첨번호 모음)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$rawPath = Join-Path $root "data\raw_all.json"
$outPath = Join-Path $root "data\lotto-data.js"

Write-Host "데이터 다운로드 중..."
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/smok95/lotto/main/results/all.json" -OutFile $rawPath

$raw = Get-Content $rawPath -Raw | ConvertFrom-Json
$clean = $raw | Sort-Object draw_no | ForEach-Object {
    [ordered]@{
        no    = $_.draw_no
        date  = $_.date.Substring(0, 10)
        nums  = $_.numbers
        bonus = $_.bonus_no
    }
}

$json = $clean | ConvertTo-Json -Compress -Depth 5
$out = "// 로또 6/45 전 회차 당첨번호 데이터 (출처: 동행복권, 1회~$($clean[-1].no)회)`nconst LOTTO_DATA = $json;`n"
[System.IO.File]::WriteAllText($outPath, $out, [System.Text.UTF8Encoding]::new($false))

Remove-Item $rawPath

Write-Host "완료: $($clean.Count)개 회차, 최신 $($clean[-1].no)회 ($($clean[-1].date))"
