#!/usr/bin/perl
# 동행복권 공식 사이트 API로 받아 둔 원본 JSON(raw/ 폴더)을 사이트용 데이터 파일로 합친다.
#
# 원본 파일(수집은 scripts/fetch-win-data.sh 참고):
#   lp_<회차>.json   로또 6/45 회차별 등수·인원·1인당 금액      (lt645/selectPstLt645Info.do)
#   ls1_/ls2_<회차>  로또 1등/2등 당첨 판매점                   (wnprchsplcsrch/selectLtWnShp.do)
#   pp_/pw_<회차>    연금복권720+ 등수별 금액 / 인원             (pt720/selectPstPt720Info.do, ...WnInfo.do)
#   ps1_/ps2_<회차>  연금복권 1등/2등 당첨 판매점                (wnprchsplcsrch/selectPtWnShp.do)
#
# 결과(이 스크립트가 쓰는 파일):
#   data/lotto-prizes.js        LOTTO_PRIZES
#   data/pension-prizes.js      PENSION_PRIZES, PENSION_PRIZE_TABLE
#   data/win-stores-lotto.js    WIN_STORES_LOTTO   (1등을 1번 이상 배출한 판매점)
#   data/win-stores-pension.js  WIN_STORES_PENSION
#
# 사용법: perl scripts/build-win-data.pl <raw 폴더>   (프로젝트 루트에서 실행)
use strict;
use warnings;
use utf8;
use JSON::PP;
use File::Basename;

my $raw = shift or die "사용법: perl scripts/build-win-data.pl <raw 폴더>\n";
my $json = JSON::PP->new->utf8->canonical;
my $out_json = JSON::PP->new->canonical->allow_nonref;   # 문자열 그대로 내보내고(utf8 아님), 파일에 쓸 때 한 번만 UTF-8로 인코딩한다
binmode(STDOUT, ":utf8");

sub slurp_json {
  my ($f) = @_;
  return undef unless -s $f;
  open my $h, "<:raw", $f or return undef;
  local $/;
  my $s = <$h>;
  close $h;
  my $j = eval { $json->decode($s) };
  return $j;
}

sub write_file {
  my ($path, $text) = @_;
  open my $o, ">:raw", $path or die "쓰기 실패: $path";
  utf8::encode($text);
  print $o $text;
  close $o;
  printf "  %s  %.1f KB\n", $path, (-s $path) / 1024;
}

# ---------------------------------------------------------------- 로또 회차별 당첨금
my @lotto_prizes;
my $last_lotto = 0;
for my $f (glob("$raw/lp_*.json")) {
  my ($n) = $f =~ /lp_(\d+)\.json$/;
  $last_lotto = $n if $n > $last_lotto;
}
my @lotto_issue;
for my $n (1 .. $last_lotto) {
  my $j = slurp_json("$raw/lp_$n.json");
  my $r = $j && $j->{data}{list} && $j->{data}{list}[0];
  if (!$r || ($r->{ltEpsd} // 0) != $n) { push @lotto_issue, $n; next; }
  $lotto_prizes[$n] = [
    $r->{tm1WnNo}, $r->{tm2WnNo}, $r->{tm3WnNo}, $r->{tm4WnNo}, $r->{tm5WnNo}, $r->{tm6WnNo}, $r->{bnsWnNo},
    $r->{rnk1WnNope}, $r->{rnk1WnAmt}, $r->{rnk2WnNope}, $r->{rnk2WnAmt}, $r->{rnk3WnNope}, $r->{rnk3WnAmt},
    $r->{rnk4WnNope}, $r->{rnk4WnAmt}, $r->{rnk5WnNope}, $r->{rnk5WnAmt}, $r->{wholEpsdSumNtslAmt}, $r->{ltRflYmd},
  ];
}
print "로또 회차별 당첨금: 1~${last_lotto}회, 누락 ", scalar(@lotto_issue), "개", (@lotto_issue ? " (@lotto_issue[0..($#lotto_issue > 9 ? 9 : $#lotto_issue)])" : ""), "\n";

# 기존 LOTTO_DATA(번호·날짜)와 대조해 불일치를 알려 준다
my %have_numbers;
{
  open my $h, "<:raw", "data/lotto-data.js" or die;
  local $/;
  my $s = <$h>;
  my ($arr) = $s =~ /const LOTTO_DATA = (\[.*\]);/s;
  my $list = $json->decode($arr);
  $have_numbers{$_->{no}} = $_ for @$list;
}
my $mismatch = 0;
for my $n (1 .. $last_lotto) {
  my $p = $lotto_prizes[$n] or next;
  my $d = $have_numbers{$n};
  if (!$d) { $mismatch++; print "  (사이트 번호 데이터에 없음) ${n}회\n"; next; }
  my $same = join(",", @{$d->{nums}}) eq join(",", @$p[0..5]) && $d->{bonus} == $p->[6];
  my $ymd = $p->[18];
  (my $dash = $ymd) =~ s/^(\d{4})(\d\d)(\d\d)$/$1-$2-$3/;
  if (!$same || $d->{date} ne $dash) { $mismatch++; print "  불일치 ${n}회: 사이트 $d->{date} @{$d->{nums}}+$d->{bonus} / 공식 $dash @$p[0..5]+$p->[6]\n"; }
}
print "번호·날짜 대조: 불일치 ${mismatch}건\n";

# 공식 값으로 compact 출력 (번호·날짜는 기존 데이터 파일이 이미 가지고 있으므로 금액만 담는다)
{
  my @rows;
  for my $n (1 .. $last_lotto) {
    my $p = $lotto_prizes[$n];
    if (!$p) { push @rows, "null"; next; }
    # [1등 인원, 1등 1인당, 2등 인원, 2등 1인당, 3등 인원, 3등 1인당, 4등 인원, 4등 1인당, 5등 인원, 5등 1인당, 총 판매금액]
    push @rows, "[" . join(",", @$p[7..17]) . "]";
  }
  my $text = "// 로또 6/45 회차별 등수별 당첨 결과 (출처: 동행복권 공식 사이트). 배열 위치=회차(0번은 비어 있음).\n"
    . "// 각 항목: [1등 인원, 1등 1인당 금액, 2등 인원, 2등 1인당, 3등 인원, 3등 1인당, 4등 인원, 4등 1인당, 5등 인원, 5등 1인당, 총 판매금액] (금액 단위: 원)\n"
    . "// 1등 인원이 0이면 해당 회차는 1등 당첨자가 없었던 회차입니다(당첨금은 다음 회차로 이월).\n"
    . "const LOTTO_PRIZES = [null,\n" . join(",\n", @rows) . "\n];\n";
  write_file("data/lotto-prizes.js", $text);
}

# ---------------------------------------------------------------- 연금복권 회차별 당첨금/인원
my $last_pension = 0;
for my $f (glob("$raw/pp_*.json")) {
  my ($n) = $f =~ /pp_(\d+)\.json$/;
  $last_pension = $n if $n > $last_pension;
}
my @pension_rows;
my @pension_issue;
my @amount_by_round;
for my $n (1 .. $last_pension) {
  my $pp = slurp_json("$raw/pp_$n.json");
  my $pw = slurp_json("$raw/pw_$n.json");
  my $pl = $pp && $pp->{data}{result};
  my $wl = $pw && $pw->{data}{result};
  if (!$pl || !@$pl || !$wl || !@$wl) { push @pension_issue, $n; push @pension_rows, "null"; next; }
  my (@amt, @cnt);
  $amt[$_->{wnSqNo} == 21 ? 8 : $_->{wnSqNo}] = $_->{wnAmt} for @$pl;
  $cnt[$_->{wnRnk}] = $_->{wnTotalCnt} for @$wl;
  $amount_by_round[$n] = join(",", map { $_ // 0 } @amt[1..8]);
  push @pension_rows, "[" . join(",", map { $_ // 0 } @cnt[1..8]) . "]";
}
my %amount_kinds;
$amount_kinds{$_}++ for grep { defined } @amount_by_round;
print "연금복권: 1~${last_pension}회, 누락 ", scalar(@pension_issue), "개. 등수별 금액 조합 ", scalar(keys %amount_kinds), "종류\n";
for my $k (sort { $amount_kinds{$b} <=> $amount_kinds{$a} } keys %amount_kinds) { print "   $k  x$amount_kinds{$k}\n"; }
{
  my ($top) = sort { $amount_kinds{$b} <=> $amount_kinds{$a} } keys %amount_kinds;
  my $text = "// 연금복권720+ 회차별 등수별 당첨 인원 (출처: 동행복권 공식 사이트). 배열 위치=회차(0번은 비어 있음).\n"
    . "// 각 항목: [1등, 2등, 3등, 4등, 5등, 6등, 7등, 보너스] 인원 (판매점+인터넷 합계). 등수별 당첨금은 PENSION_PRIZE_AMOUNTS 참고.\n"
    . "const PENSION_PRIZES = [null,\n" . join(",\n", @pension_rows) . "\n];\n"
    . "// 등수별 당첨금(원). 1등·2등·보너스는 매월 지급되는 금액, 총액은 각각 20년·10년·10년 분할.\n"
    . "const PENSION_PRIZE_AMOUNTS = [" . $top . "];\n";
  write_file("data/pension-prizes.js", $text);
}

# ---------------------------------------------------------------- 당첨 판매점 집계
my %KNOWN_SIDO = map { $_ => 1 } qw(서울 경기 인천 강원 충북 충남 대전 세종 전북 전남 광주 경북 경남 대구 부산 울산 제주);

sub blank { my $v = shift; return !(defined $v && $v =~ /\S/); }

# 같은 판매점의 여러 회차 기록을 합친다: 비어 있지 않은 값 중 가장 최근 회차 것을 쓴다
sub merge_fields {
  my ($e, $s) = @_;
  for my $k (qw(shpNm rdnm daddr befAddr region shpLat shpLot shpTelno)) {
    $e->{f}{$k} = $s->{$k} unless blank($s->{$k}) || ($k =~ /^shp(Lat|Lot)$/ && !$s->{$k});
  }
  $e->{f}{status} = $s->{status} if defined $s->{status};
}

sub place_of {
  my ($f) = @_;
  my $base = !blank($f->{rdnm}) ? $f->{rdnm} : ($f->{befAddr} // "");
  $base =~ s/^\(당첨 당시 주소\)\s*//;
  $base =~ s/^\s+|\s+$//g;
  $base =~ s/\s+/ /g;
  my @t = split / /, $base;
  my $sido = shift(@t) // "";
  my $city = $t[0] // "";
  if ($sido eq "전남광주") { $sido = ($city =~ /구$/) ? "광주" : "전남"; }
  $sido = "" unless $KNOWN_SIDO{$sido};
  $city = "" if $sido eq "세종";
  my $detail = $f->{daddr} // "";
  $detail =~ s/^\s+|\s+$//g;
  $detail =~ s/\s*\([^)]*\)\s*$//;                    # 끝의 "(가리봉동)" 같은 괄호는 지운다
  my $addr = $base;
  $addr .= " $detail" if $detail ne "" && $base ne "" && index($base, $detail) < 0;
  return ($sido, $city, $addr);
}

sub build_stores {
  my ($prefix, $last, $label, $outfile, $varname) = @_;
  my %st;
  my %internet;      # 회차 -> {등수 -> 인터넷 판매 건수}
  my $win1 = 0; my $win2 = 0; my $miss = 0; my %miss_rank;
  my $first = $prefix eq "ls" ? 262 : 1;
  for my $n ($first .. $last) {
    for my $rank (1, 2) {
      my $j = slurp_json("$raw/${prefix}${rank}_$n.json");
      if (!$j) { $miss++; $miss_rank{$rank}++; next; }
      for my $s (@{ $j->{data}{list} || [] }) {
        my $id = $s->{ltShpId} // "";
        my $is_net = ($id eq "" || $id =~ /^0+$/ || ($s->{shpNm} // "") =~ /인터넷 복권판매사이트/ || ($s->{rdnm} // "") =~ /dhlottery/);
        if ($is_net) { $internet{$n}{$rank}++ ; next; }
        my $e = $st{$id} //= { id => $id, w => [], w2 => 0, f => {} };
        my $atmt = $s->{atmtPsvYnTxt} // "";
        my $type = $atmt eq "자동" ? 0 : $atmt eq "수동" ? 1 : $atmt eq "반자동" ? 2 : 3;
        if ($rank == 1) { push @{ $e->{w} }, $n * 4 + $type; $win1++; }
        else { $e->{w2}++; $win2++; }
        merge_fields($e, $s);
      }
    }
  }
  # 1등 기록이 빠져 있으면 집계가 틀리므로 만들지 않는다. 2등 기록이 일부 빠져 있으면 2등 횟수만 뺀다.
  die "$label: 1등 판매점 기록이 ", ($miss_rank{1} || 0), "개 회차 빠져 있어 만들지 않습니다. fetch-win-data.sh 를 먼저 끝까지 실행하세요.\n" if $miss_rank{1};
  my $has2 = $miss_rank{2} ? 0 : 1;
  print "  (2등 판매점 기록이 ", ($miss_rank{2} || 0), "개 회차 빠져 있어 2등 횟수는 담지 않습니다)\n" unless $has2;
  print "$label: 판매점 ", scalar(keys %st), "곳 (1등 기록 ${win1}건, 2등 기록 ${win2}건), 파일 누락 ${miss}개\n";

  my @list;
  my $nosido = 0;
  for my $e (values %st) {
    next unless @{ $e->{w} };            # 1등을 낸 적이 있는 곳만 담는다
    my $f = $e->{f};
    my ($sido, $city, $addr) = place_of($f);
    $nosido++ if $sido eq "";
    my $lat = $f->{shpLat}; my $lon = $f->{shpLot};
    $lat = 0 unless defined $lat && $lat > 30 && $lat < 40;
    $lon = 0 unless defined $lon && $lon > 120 && $lon < 135;
    my $rec = {
      i => $e->{id}, n => ($f->{shpNm} // ""), a => $addr, s => $sido, c => $city,
      la => $lat ? $lat + 0 : 0, lo => $lon ? $lon + 0 : 0,
      w => [ sort { $a <=> $b } @{ $e->{w} } ],
    };
    $rec->{v} = $e->{w2} if $has2 && $e->{w2};
    $rec->{x} = 1 if (($f->{status} // "") ne "정상");
    my $tel = $f->{shpTelno}; $tel =~ s/^\s+|\s+$//g if defined $tel;
    $rec->{t} = $tel if defined $tel && $tel =~ /\d/;
    push @list, $rec;
  }
  @list = sort { @{ $b->{w} } <=> @{ $a->{w} } || ($b->{w}[-1] <=> $a->{w}[-1]) || $a->{n} cmp $b->{n} } @list;
  my $with_geo = grep { $_->{la} } @list;
  my $closed_n = grep { $_->{x} } @list;
  print "  1등 배출 판매점 ", scalar(@list), "곳 (좌표 있음 $with_geo, 폐점 $closed_n, 시도 불명 $nosido)\n";
  print "  상위 5곳: ", join(" / ", map { "$_->{n}(" . scalar(@{ $_->{w} }) . ")" } grep { defined } @list[0..($#list < 4 ? $#list : 4)]), "\n";

  my %sidocount; $sidocount{$_->{s}}++ for @list;
  print "  시도 분포: ", join(", ", map { "$_=$sidocount{$_}" } sort keys %sidocount), "\n";

  my $text = "// $label 1등 배출 판매점 (출처: 동행복권 공식 사이트 '당첨 판매점' 조회, 최신 ${last}회까지). scripts/build-win-data.pl 로 생성.\n"
    . "// i=판매점ID n=상호 a=주소 s=시도 c=시군구 la/lo=좌표(없으면 0) t=전화 x=1이면 폐점\n"
    . "// w=1등 당첨 기록들 (회차*4+구분, 구분 0=자동 1=수동 2=반자동 3=미표기) v=2등 배출 횟수(META.rank2가 true일 때만)\n"
    . "window.$varname = [\n" . join(",\n", map { $out_json->encode($_) } @list) . "\n];\n";
  # 인터넷 판매 1등 수(회차별)
  my @net = map { $internet{$_}{1} // 0 } (0 .. $last);
  $text .= "window.${varname}_NET1 = " . $out_json->encode(\@net) . ";\n";
  $text .= "window.${varname}_META = " . $out_json->encode({ rank2 => $has2 ? JSON::PP::true : JSON::PP::false }) . ";\n";
  write_file($outfile, $text);
}

build_stores("ls", $last_lotto, "로또 6/45", "data/win-stores-lotto.js", "WIN_STORES_LOTTO");
if ($last_pension > 0) { build_stores("ps", $last_pension, "연금복권720+", "data/win-stores-pension.js", "WIN_STORES_PENSION"); }
print "완료\n";
