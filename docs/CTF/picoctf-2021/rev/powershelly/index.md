## tl;dr

powershell

## プログラム

うわぁ、powershell だ...。書いたことないんですけど！

```powershell
$input = ".\input.txt"

$out = Get-Content -Path $input
$enc = [System.IO.File]::ReadAllBytes("$input")
$encoding = [system.Text.Encoding]::UTF8
$total = 264
$t = ($total + 1) * 5
$numLength = ($total * 30 ) + $t
if ($out.Length -gt 5 -or $enc.count -ne $numLength)
{
  Write-Output "Wrong format 5"
  Exit
}

else
{
  for($i=0; $i -lt $enc.count ; $i++)
  {
    if (($enc[$i] -ne 49) -and ($enc[$i] -ne 48) -and ($enc[$i] -ne 10) -and ($enc[$i] -ne 13) -and ($enc[$i] -ne 32))
    {
      Write-Output "Wrong format 1/0/"
      Exit
    }
  }
}

$blocks = @{}
for ($i=0; $i -lt $out.Length ; $i++)
{
  $r = $out[$i].Split(" ")
  if ($i -gt 0)
  {
    for ($j=0; $j -lt $r.Length ; $j++)
    {
    if ($r[$j].Length -ne 6)
    {
      Write-Output "Wrong Format 6" $r[$j].Length
      Exit
    }
      $blocks[$j] += $r[$j]
    }
  }
  else
  {
    for ($j=0; $j -lt $r.Length ; $j++)
    {
    if ($r[$j].Length -ne 6)
    {
      Write-Output "Wrong Format 6" $r[$j].Length
      Exit
    }
      $blocks[$j] = @()
      $blocks[$j] += $r[$j]
    }
  }

}


function Exit  {
  exit
}


function Random-Gen {
  $list1 = @()
  for ($i=1; $i -lt ($blocks.count + 1); $i++)
  {
    $y = ((($i * 327) % 681 ) + 344) % 313
    $list1 += $y
  }
  return $list1
}


function Scramble {
    param (
        $block,
        $seed
    )
    $raw = [system.String]::Join("", $block)
    $bm = "10 " * $raw.Length
    $bm = $bm.Split(" ")
    for ($i=0; $i -lt $raw.Length ; $i++)
    {

      $y = ($i * $seed) % $raw.Length
      $n = $bm[$y]
      while ($n -ne "10")
      {
        $y = ($y + 1) % $raw.Length
        $n = $bm[$y]
      }
      if ($raw[$i] -eq "1" )
      {
        $n = "11"
      }
      else
      {
      $n = "00"
      }
      $bm[$y] = $n
    }
    $raw2 = [system.String]::Join("", $bm)
    $b = [convert]::ToInt64($raw2,2)
    return $b
}


$result = 0
$seeds = @()
for ($i=1; $i -lt ($blocks.count +1); $i++)
{
  $seeds += ($i * 127) % 500
}

$randoms = Random-Gen
$output_file = @()
for ($i=0; $i -lt $blocks.count ; $i++)
{

  $fun = Scramble -block $blocks[$i] -seed $seeds[$i]
  if($i -eq 263)
  {
  Write-Output $seeds[$i]
  Write-Output $randoms[$i]
  Write-Output $fun
  }
  $result = $fun -bxor $result -bxor $randoms[$i]
  $output_file += $result
}
  Add-Content -Path output.txt -Value $output_file
```

この結果の output の一部 (全体で 264 行)

```
879059547225600221
71793452475485205
1148698281253257227
217070812329394967
...
```

## 解法

powershell を書いた事がないので、コードからエスパーでお気持ちを理解します。

まず、FLAG を表していると考えられる入力の形式について。

行数は 5, 空白で区切った時に 6 文字区切り, 全体の文字数は 264 × 5 × 6 + α となっています。つまり、恐らく以下のようにブロックが 264 連なった形になっているでしょう。

```
****** ****** ****** ...
****** ****** ****** ...
****** ****** ****** ...
****** ****** ****** ...
****** ****** ****** ...
```

ブロックごとに 1 つの文字列に結合しているようです。つまり、ブロック毎に長さ 30 の `0110...` 羅列があるという事です。

次に、文字コードについて。文字は `1`, `0`, `\n`, `\r`, ` ` しか含まれないようです。上の図のアスタリスクの部分は全て `1` か `0` という事でしょうか。

次は、プログラムのエンコードを見ていきます。出オチのようですが、まず `randoms` も `seeds` もランダムではありません。

```powershell
function Random-Gen {
  $list1 = @()
  for ($i=1; $i -lt ($blocks.count + 1); $i++)
  {
    $y = ((($i * 327) % 681 ) + 344) % 313
    $list1 += $y
  }
  return $list1
}
...
$seeds = @()
for ($i=1; $i -lt ($blocks.count +1); $i++)
{
  $seeds += ($i * 127) % 500
}
$randoms = Random-Gen
```

それでは、エンコード本体を見ていきましょう。

```powershell
$output_file = @()
for ($i=0; $i -lt $blocks.count ; $i++)
{

  $fun = Scramble -block $blocks[$i] -seed $seeds[$i]
  if($i -eq 263)
  {
  Write-Output $seeds[$i]
  Write-Output $randoms[$i]
  Write-Output $fun
  }
  $result = $fun -bxor $result -bxor $randoms[$i]
  $output_file += $result
}
```

要は、`Scramble` の結果と今までの `result` と `randoms` を xor した値を新たに `result` にして、ファイルに整数値を出力しているという事です。

`randoms` は分かっていますから、早速 `Scramble` を見ていきましょう。

```powershell

function Scramble {
    param (
        $block,
        $seed
    )
    $raw = [system.String]::Join("", $block)
    $bm = "10 " * $raw.Length
    $bm = $bm.Split(" ")
    for ($i=0; $i -lt $raw.Length ; $i++)
    {

      $y = ($i * $seed) % $raw.Length
      $n = $bm[$y]
      while ($n -ne "10")
      {
        $y = ($y + 1) % $raw.Length
        $n = $bm[$y]
      }
      if ($raw[$i] -eq "1" )
      {
        $n = "11"
      }
      else
      {
      $n = "00"
      }
      $bm[$y] = $n
    }
    $raw2 = [system.String]::Join("", $bm)
    $b = [convert]::ToInt64($raw2,2)
    return $b
}
```

分かりやすく言うと、`["10","10","10","10","10","10",...]` の配列に対して、ある index を選んで ブロックの今見ている部分が `0` なら `00` に、`1` なら `11` に変えるという操作になります。

このある index というのは、seeds のみに依存しており、入力は全く関係ありません。つまり、どの index が選ばれるかが分かります。

一通り操作が終わった後、配列を 2 進数と見て整数値に変換したものを返しています。これで、全ての操作が可逆である事が判明しましたので、逆変換スクリプトを書いてみます。

恐らく `0` と `1` はアスキーアートでしょうから、見やすくするために `□` と `■` にしています。

```python
seeds=[]
for i in range(1,265):
    seeds.append(i*127%500)
#print(seeds)

rand=[]
for i in range(1,265):
    rand.append((i*327%681+344)%313)
#print(rand)

result=0

output=[""]*5
for i in range(264):
    hash=int(input())
    binary=bin(hash^rand[i]^result)[2:]
    if len(binary)%2==1:
        binary="0"+binary
    length=len(binary)//2
    isdone=[False]*length
    flag=""
    for j in range(length):
        idx=j*seeds[i]%length
        while isdone[idx]==True:
            idx=(idx+1)%length
        isdone[idx]=True
        assert binary[idx*2]==binary[idx*2+1]
        if binary[idx*2:idx*2+2]=="00":
            flag+="■"
        else:
            flag+="□"
    for j in range(30):
        output[j//6]+=flag[j]
    for j in range(5):
        output[j]+=" "
    result=hash

for i in range(5):
    print(output[i])
```

結果！！

![result](result.png)

やったぜ。（実際はもっと横に長く繋がっています）

あとは、整数値として見て文字列に変換するだけです。

```python
flag=input()
res=0
for i in range(len(flag)//7):
    if flag[i*7+1]=='■':
        res=res*2+0
    else:
        res=res*2+1
from Crypto.Util.number import long_to_bytes
print(long_to_bytes(res).decode())
```