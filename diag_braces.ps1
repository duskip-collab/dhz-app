$l = Get-Content 'src/lib/members/members.service.ts'
$bal=0
for($i=0;$i -lt $l.Count;$i++){
  $t=$l[$i]
  $prev=$bal
  $bal += ([regex]::Matches($t,'\{')).Count
  $bal -= ([regex]::Matches($t,'\}')).Count
  if($t -match '^export async function|^export function|^const [A-Z]'){
    Write-Output (("[bal={0}] L{1}: {2}" -f $bal,($i+1),$t.Trim()))
  }
}
Write-Output ("FINAL_BAL={0}" -f $bal)
