## tl;dr

tcache poisoning

## プログラム

- FLAG 付きの malloc を 7 回 (A と呼ぶ)
- FLAG なしの malloc を 1 回 (B と呼ぶ)
- A を free
- B を free
- 任意のアドレス（入力）に任意の 1 バイト（入力）を代入
- malloc して、出力

malloc は全て 0x80 バイトです。

## 解法

さて、malloc というのは最後に free をしたものを返すため、何もしないと最後の malloc で返ってくるのは B です。

また、今回の場合は malloc サイズが小さいため tcache という仕組みの 双方向連結リスト (free list) に繋がれます。free list の様子を見てみましょう。

- 最初

```
bin -> 無
```

- free(A)

```
bin -> A
```

- free(B)

```
bin -> B -> A
```

**ここで、任意の 1 バイトを変えられる**

-  malloc

```
bin -> A
```

tcache bin も他の malloc chunk 同様に FD, BK で管理されている訳なので、その FD を書き換えて malloc をする時にこんな状態にすれば FLAG が出力されそうな気がしますね。

```
bin -> A
B -> A (関係ない)
```

B のアドレスの下位 1 バイトを 0 にすると FLAG が出るっぽいので、tcache bin の FD の下位 1 バイトまでの offset を探しましょう。

入力は最初に malloc したアドレスからの offset なので、tcache bin からそう遠くはないはずです。ローカルとリモートでは libc が違うので、offset は検討をつけてから全探索します。

結果、-5144 でした。

```python
from pwn import *

#p=process("./heapedit")
p=remote("mercury.picoctf.net",17612)
p.sendline(b"-5144")
p.sendline(b"\x00")
p.recvuntil(b"Value:")
print(p.recvall())
p.close()
```