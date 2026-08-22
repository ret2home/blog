---
og_image: /assets/seccamp2026_problem.png
description: セキュリティキャンプ 2026 全国大会開発 Y4 CDN ゼミの応募課題公開　ブラウザに URL を入力してからレンダリングされるまでを追う
---

久しぶりの投稿になります．最後が高校三年生の文化祭の作業ログとかだったので，3 年ぶりでしょうか．
近況としては，無事に大学受験・進振りも終わり，理学部情報科学科で wktk しております．

さて，先日セキュリティキャンプ 2026 選考結果の発表があり，開発 Y4 「CDN 自作ゼミ」に参加できることになりました．
毎年存在は認識しつつ，なんだかんだ提出まで漕ぎ着けていなかったセキュキャンについに...

という訳で，折角なので先人たちにならって応募課題さらしをしようと思います．

先に disclaimer ですが，非常に長いです．ここに含めていない短い設問 2 問含めて PDF にしたら 60 ページくらいありました．なぜこんなに長くなったかと言えば，大体書き終わったかな！と思って去年の参加者の応募課題さらしを見て，あまりの長さに驚愕したからですね．（ということは，これを見た来年の応募者は・・）

本来はテキスト形式で提出したものを markdown に適当に置き換えたものなので，画像などもなく幾分(あるいはとても)読みづらいかもしれません．サイドバーに目次があるので，活用していただければと思います．

!!! note "引用したソースコードについて"

    本記事中の Mozilla Firefox / NSS / Necko のコード片は，挙動説明のために Mozilla source から必要部分を抜粋したものです．原著作物は Mozilla Public License 2.0 の下で提供されています．

    本記事中の Linux kernel のコード片は，TCP state machine の挙動説明のために Linux kernel source から必要部分を抜粋したものです．原著作物は GPL-2.0-only の下で提供されています．

    なお，引用部分の著作権およびライセンスは各原著作物に従います．

## 1. 全体像

問: 「ブラウザのURLバーに、 https://www.shonenjump.com/j/weeklyshonenjump/ を入力して決定キーを押した時になにが起こるか」を調べて、可能な限り詳しく説明してください。

以下の通り，私のローカル環境を問における解析の対象とする．
VM を用いたのは余計なパケットが解析を妨げないようにするためと，ことネットワーク解析に関しては Linux の方が慣れているためである．

- Host: Macbook Air M1 2020
- Emulator: UTM Version 4.4.4 (92)

VM:

  - OS: Ubuntu 24.04.4 LTS
  - Browser: Mozilla Firefox Snap for Ubuntu 150.0.1(aarch64) 

実際に分析を始める前に，一般論から予想されるブラウザから見た大まかな流れを以下に示す．

a. Enter キーを押したことが伝わる <br>
b. URL 認識<br>
c. DNS <br>
d. TCP/TLS Handshake <br>
e. HTTP Request <br>
f. Response を元に，追加リソース(css,js,image..)を取得 <br>
g. (f. と並行で)構文解析・レンダリング

https://developer.mozilla.org/ja/docs/Web/Performance/Guides/How_browsers_work

解析では，上記の各項の内容及び，各項の間を，ブラウザ内に限らずなるべく詳しく調べることを目標とする．

全体の解析方法の流れは以下の通り．(章立てに対応する)

2.情報収集: <br>
実際にブラウザで開いた時の挙動を簡単に観察し，各種ツールで情報収集する

3.パケット解析: <br>
Wireshark で packet capture し，ネットワークを介して何が起きているかを探る (c-f に対応)

4.Firefox 解析: <br>
Profiler を用いつつ，Firefox を解析してコードレベルで何が起きているかを探る (a-g に対応)

5.TCP 解析: <br>
OS 側の担当である TCP の挙動を解析 (d に対応)

6.ネットワーク経路解析: <br>
1 本の TCP が Client - Server 間を往復するルートを解析(d-f に対応)

7.サーバ側解析: <br>
Apache の挙動を解析 (d-f に対応)


参考文献については，文中に簡潔にリンクを貼る形式で示す．

使用した LLM の結果を share する．(注: 個人情報を含むため削除)

また，調査においては，去年の応募者の回答を参考にした．
https://www.on-keyday.net/static/blog/posts/2025_07_15_seccamp_2025_y2_application/

<br>

## 2. 情報収集

以降の詳細な解析に役に立つ情報を，まずは簡単に集める．

### 2.1. ブラウザで開いてみる

まずは実際に Firefox で開いて，Developer Tools を起動した状態で URL を開いた．なお，以下特にことわりがない限り，URL を開く実験を行う際は，条件を同じにするためサイトキャッシュを削除した状態で実行するものとする．また，設定は初期設定から一切変更しない．

Network タブを開くと，まず /j/weeklyshonenjump/ が GET されることがわかる．

```text
Request Headers:
GET /j/weeklyshonenjump/ HTTP/2
Host: www.shonenjump.com
User-Agent: Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:150.0) Gecko/20100101 Firefox/150.0
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8
Accept-Language: en-US,en;q=0.9
Accept-Encoding: gzip, deflate, br, zstd
Connection: keep-alive
Upgrade-Insecure-Requests: 1
Sec-Fetch-Dest: document
Sec-Fetch-Mode: navigate
Sec-Fetch-Site: none
Sec-Fetch-User: ?1
Priority: u=0, i
TE: trailers
```
```text
Response Headers:
HTTP/2 200 
date: Fri, 08 May 2026 06:27:35 GMT
server: Apache
x-frame-options: SAMEORIGIN
content-type: text/html
X-Firefox-Spdy: h2
```
??? note "TLS detail"

    ```text
    TLS detail:
    {
    	"Connection:": {
    		"Protocol version:": "TLSv1.3",
    		"Cipher suite:": "TLS_AES_256_GCM_SHA384",
    		"Key Exchange Group:": "x25519",
    		"Signature Scheme:": "RSA-PSS-SHA256"
    	},
    	"Host www.shonenjump.com:": {
    		"HTTP Strict Transport Security:": "Disabled",
    		"Public Key Pinning:": "Disabled"
    	},
    	"Certificate:": {
    		"Issued To": {
    			"Common Name (CN):": "*.shonenjump.com",
    			"Organization (O):": "<Not Available>",
    			"Organizational Unit (OU):": "<Not Available>"
    		},
    		"Issued By": {
    			"Common Name (CN):": "R13",
    			"Organization (O):": "Let's Encrypt",
    			"Organizational Unit (OU):": "<Not Available>"
    		},
    		"Period of Validity": {
    			"Begins On:": "Tue, 07 Apr 2026 14:13:18 GMT",
    			"Expires On:": "Mon, 06 Jul 2026 14:13:17 GMT"
    		},
    		"Fingerprints": {
    			"SHA-256 Fingerprint:": "5A:D8:EA:E9:2E:AC:86:A5:DA:AD:F0:22:A1:30:0B:22:9D:9B:32:81:99:0A:2D:DE:88:30:FB:BB:2D:B2:CA:58",
    			"SHA1 Fingerprint:": "67:35:69:EB:07:07:46:2C:45:7A:79:87:52:73:D6:8D:FE:88:5E:5E"
    		},
    		"Transparency:": "Valid SCT records"
    	}
    }
    ```

主な情報は以下の通り

- HTTP version: HTTP/2
- Content-Encoding: なし（！）
- alt-svc: なし -> この接続では HTTP/3 への案内はなし https://asnokaze.hatenablog.com/entry/2022/03/06/005252
- Server: Apache
- TLS ver: TLSv1.3
- 暗号化: TLS_AES_256_GCM_SHA384
- 鍵共有: x25519(Diffie-Hellman 鍵交換)
- デジタル署名: RSA-PSS-SHA256
- 証明書発行元: Let's Encrypt

aarch64 を使用しているはずなのに User-Agent に x86_64 と表示されて疑問に思ったが，これは Youtube など一部のサイトが Linux aarch64 の場合に解像度を下げてしまう問題への解決策として， Firefox 123 以降に適用された仕様である．

> To reduce user fingerprinting information and the risk of some website compatibility issues, we now report ARM64 Linux's CPU architecture as "x86_64" and ARM and x86 Android's as "armv81" in Firefox's User-Agent string and the navigator.platform and navigator.oscpu Web APIs.

https://bugzilla.mozilla.org/show_bug.cgi?id=1869521
https://www.firefox.com/en-US/firefox/android/123.0/releasenotes/

また，RFC 9218 で定義された Priority Header が Request Header に含まれていることも確認できる．これは 2024 年 Release の 128 以降に導入された仕様である．
https://datatracker.ietf.org/doc/rfc9218/
https://developer.mozilla.org/ja/docs/Mozilla/Firefox/Releases/128

続いて，ページに必要な CSS, JS, 画像ファイルが並列に読み込まれる．
並行して，ページ上にレンダリングが行われる．
さらに続いて，youtube.com や fonts.gstatic.com などの外部ドメインへもリクエストが飛んでいた．これらのリクエストでは HTTP/3 が用いられていた．

### 2.2. 各種情報収集

IP routing やドメインまわりの情報を簡単に収集する．以下，コマンドの実行結果については長いので 2.2 節の最後におく．

手元で dig コマンドを実行すると，A レコードが返ってきて，IP アドレスが 202.218.223.232 とわかる．
また，SERVER: 127.0.0.53 より systemd-resolved が解決しているようだ．
https://pcvogel.sarakura.net/2022/09/06/36606

また，Mac 側で ifconfig を確認すると，DNS Server に割り当てられている 192.168.64.1 が vmnet0 であることがわかった．
これらから，systemd-resolved が VM 仮想ネットワークを通じて Mac と通信していることがわかる．

https://hnakamur.github.io/blog/2020/05/25/change-macos-hypervisor.framework-vm-subnet-ip-address/
https://developer.apple.com/documentation/vmnet

whois コマンドを実行すると，主に次のことがわかる．

- Domain 持ち主: 株式会社集英社
- Server IP: 株式会社 IDC フロンティア / IMPRESSGROUP
- Name Server: AWS Route53

さらに，traceroute の応答からは，少なくともこの実行では次のような hop が観測された．(途中 \*\*\* Hop 略)

1. 192.168.64.1
2. 192.168.3.1 (ルータ)
3. 221.110.222.214 (bbtec.net) (AS17676 ソフトバンク株式会社)
4. 221.110.222.213 (bbtec.net) 
5. 101.203.70.90 (BBIX)
6. 202.218.223.232 (server) (AS4694 株式会社IDCフロンティア)

101.203.70.90 の AS 番号は得られなかったが，BBIX Tokyo の顧客リストに AS17676, AS4694 が入っていたため，BBIX Tokyo を経由したものと考えられる．
https://www.bbix.net/participants_list_tk/
https://develop.tools/ip-asn/

(まとめ)

本章では，詳細解析に入る前の情報収集として，Developer Tools，dig，resolvectl など各種コマンド を用いた．その結果，今回の環境では，最初の document request は HTTP/2 over TLSv1.3 で www.shonenjump.com に送られ，server header として Apache が観測された．DNS では www.shonenjump.com の A record として 202.218.223.232 が返り，Guest 内では systemd-resolved，Host 側では UTM/vmnet の bridge100 を経由して DNS server へ到達していると考えられる．また，traceroute から，VM から Host，家庭内 router，SoftBank/BBIX 近辺を経由して 202.218.223.232 に到達する経路が観測された．

以降の章では，これらの観測結果をもとに，packet capture による時系列，Firefox 内部の処理，TCP handshake，network routing を順に詳しく追う．


??? note "コマンド実行結果"

    ```text
    $ dig www.shonenjump.com
    
    ; <<>> DiG 9.18.39-0ubuntu0.24.04.3-Ubuntu <<>> www.shonenjump.com
    ;; global options: +cmd
    ;; Got answer:
    ;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 7468
    ;; flags: qr rd ra; QUERY: 1, ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 1
    
    ;; OPT PSEUDOSECTION:
    ; EDNS: version: 0, flags:; udp: 65494
    ;; QUESTION SECTION:
    ;www.shonenjump.com.		IN	A
    
    ;; ANSWER SECTION:
    www.shonenjump.com.	54	IN	A	202.218.223.232
    
    ;; Query time: 0 msec
    ;; SERVER: 127.0.0.53#53(127.0.0.53) (UDP)
    ;; WHEN: Fri May 08 17:02:17 JST 2026
    ;; MSG SIZE  rcvd: 63
    
    $ resolvectl status
    Global
             Protocols: -LLMNR -mDNS -DNSOverTLS DNSSEC=no/unsupported
      resolv.conf mode: stub
    
    Link 2 (enp0s1)
        Current Scopes: DNS
             Protocols: +DefaultRoute -LLMNR -mDNS -DNSOverTLS DNSSEC=no/unsupported
    Current DNS Server: 192.168.64.1
           DNS Servers: 192.168.64.1
    DNS Domain: TAILSCALE_DNS_DOMAIN
    
    
    $ ifconfig bridge100
    bridge100: flags=8a63<UP,BROADCAST,SMART,RUNNING,ALLMULTI,SIMPLEX,MULTICAST> mtu 1500
    	options=3<RXCSUM,TXCSUM>
    	ether HOST_BRIDGE_MAC
    	inet 192.168.64.1 netmask 0xffffff00 broadcast 192.168.64.255
    	inet6 fe80::HOST_BRIDGE_LINK_LOCAL%bridge100 prefixlen 64 scopeid 0x1a 
    	inet6 fde1:5b59:b17d:7a3c:18e6:7fa1:6821:67be prefixlen 64 autoconf secured 
    	Configuration:
    		id 0:0:0:0:0:0 priority 0 hellotime 0 fwddelay 0
    		maxage 0 holdcnt 0 proto stp maxaddr 100 timeout 1200
    		root id 0:0:0:0:0:0 priority 0 ifcost 0 port 0
    		ipfilter disabled flags 0x0
    	member: vmenet0 flags=3<LEARNING,DISCOVER>
    	        ifmaxaddr 0 port 25 priority 0 path cost 0
    	Address cache:
    		VM_MAC Vlan1 vmenet0 1196 flags=0<>
    	nd6 options=201<PERFORMNUD,DAD>
    	media: autoselect
    	status: active
    
    $ whois 202.218.223.232
    [ JPNIC database provides information regarding IP address and ASN. Its use   ]
    [ is restricted to network administration purposes. For further information,  ]
    [ use 'whois -h whois.nic.ad.jp help'. To only display English output,        ]
    [ add '/e' at the end of command, e.g. 'whois -h whois.nic.ad.jp xxx/e'.      ]
    
    Network Information:            
    a. [Network Number]             202.218.223.128/25
    b. [Network Name]               IMPRESSGROUP
    g. [Organization]               Impress Holdings, Inc.
    m. [Administrative Contact]     MY7594JP
    n. [Technical Contact]          CK637JP
    o. [Abuse]                      
    p. [Nameserver]
    [Assigned Date]                 2006/08/10
    [Return Date]                   
    [Last Update]                   2012/12/05 08:30:31(JST)
                                    
    Less Specific Info.
    ----------
    IDC Frontier Inc.
                         [Allocation]                 202.218.77.0-202.218.255.255
    IDC Frontier Inc.
            SUBA-032-223 [Sub Allocation]                         202.218.223.0/24
    
    More Specific Info.
    ----------
    No match!!
    
    
    $ whois shonenjump.com
       Domain Name: SHONENJUMP.COM
       Registry Domain ID: 87648335_DOMAIN_COM-VRSN
       Registrar WHOIS Server: whois.jprs.jp
       Registrar URL: http://jprs.jp/registrar/
       Updated Date: 2025-02-28T07:31:22Z
       Creation Date: 2002-06-18T17:40:06Z
       Registry Expiry Date: 2027-03-02T04:59:59Z
       Registrar: Japan Registry Services Co., Ltd.
       Registrar IANA ID: 1485
       Registrar Abuse Contact Email: gtld-abuse@jprs.jp
       Registrar Abuse Contact Phone: +81.352158457
       Domain Status: ok https://icann.org/epp#ok
       Name Server: NS-1230.AWSDNS-25.ORG
       Name Server: NS-1592.AWSDNS-07.CO.UK
       Name Server: NS-509.AWSDNS-63.COM
       Name Server: NS-816.AWSDNS-38.NET
       DNSSEC: unsigned
       URL of the ICANN Whois Inaccuracy Complaint Form: https://www.icann.org/wicf/
    >>> Last update of whois database: 2026-05-08T08:55:37Z <<<
    
    For more information on Whois status codes, please visit https://icann.org/epp
    
    NOTICE: The expiration date displayed in this record is the date the
    registrar's sponsorship of the domain name registration in the registry is
    currently set to expire. This date does not necessarily reflect the expiration
    date of the domain name registrant's agreement with the sponsoring
    registrar.  Users may consult the sponsoring registrar's Whois database to
    view the registrar's reported date of expiration for this registration.
    
    TERMS OF USE: You are not authorized to access or query our Whois
    database through the use of electronic processes that are high-volume and
    automated except as reasonably necessary to register domain names or
    modify existing registrations; the Data in VeriSign Global Registry
    Services' ("VeriSign") Whois database is provided by VeriSign for
    information purposes only, and to assist persons in obtaining information
    about or related to a domain name registration record. VeriSign does not
    guarantee its accuracy. By submitting a Whois query, you agree to abide
    by the following terms of use: You agree that you may use this Data only
    for lawful purposes and that under no circumstances will you use this Data
    to: (1) allow, enable, or otherwise support the transmission of mass
    unsolicited, commercial advertising or solicitations via e-mail, telephone,
    or facsimile; or (2) enable high volume, automated, electronic processes
    that apply to VeriSign (or its computer systems). The compilation,
    repackaging, dissemination or other use of this Data is expressly
    prohibited without the prior written consent of VeriSign. You agree not to
    use electronic processes that are automated and high-volume to access or
    query the Whois database except as reasonably necessary to register
    domain names or modify existing registrations. VeriSign reserves the right
    to restrict your access to the Whois database in its sole discretion to ensure
    operational stability.  VeriSign may restrict or terminate your access to the
    Whois database for failure to abide by these terms of use. VeriSign
    reserves the right to modify these terms at any time.
    
    The Registry database contains ONLY .COM, .NET, .EDU domains and
    Registrars.
    Domain Name: SHONENJUMP.COM
    Registry Domain ID: 87648335_DOMAIN_COM-VRSN
    Registrar WHOIS Server: whois.jprs.jp
    Registrar URL: https://jprs.jp/registrar/
    Updated Date: 2025-02-28T07:31:23Z
    Creation Date: 2002-06-18T17:40:06Z
    Registrar Registration Expiration Date: 2027-03-02T04:59:59Z
    Registrar: Japan Registry Services Co.,Ltd.(JPRS)
    Registrar IANA ID: 1485
    Registrar Abuse Contact Email: gtld-abuse@jprs.jp
    Registrar Abuse Contact Phone: +81.352158457
    Domain Status: ok  https://icann.org/epp#ok
    Registry Registrant ID: Not Available From Registry
    Registrant Name: SHUEISHA Inc.
    Registrant Street: 2-5-10,Hitotsubashi
    Registrant City: Chiyoda-ku
    Registrant State/Province: Tokyo
    Registrant Postal Code: 101-8050
    Registrant Country: JP
    Registrant Phone: +81.332306291
    Registrant Fax: +81.332389256
    Registrant Email: domains@sur.co.jp
    Registry Admin ID: Not Available From Registry
    Admin Name: SUURI-KEIKAKU CO. LTD.
    Admin Street: 2-4-6 Hitotsubashi
    Admin City: Chiyoda-ku
    Admin State/Province: Tokyo
    Admin Postal Code: 101-0003
    Admin Country: JP
    Admin Phone: +81.352109611
    Admin Fax: +81.332216336
    Admin Email: domains@sur.co.jp
    Registry Tech ID: Not Available From Registry
    Tech Name: Impress Professional Works, Inc.
    Tech Street: 1-105 Kanda Jinbo-cho
    Tech City: Chiyoda-ku
    Tech State/Province: Tokyo
    Tech Postal Code: 101-0051
    Tech Country: JP
    Tech Phone: +81.368375010
    Tech Email: nic-notify@impress.co.jp
    Name Server: NS-509.AWSDNS-63.COM
    Name Server: NS-816.AWSDNS-38.NET
    Name Server: NS-1592.AWSDNS-07.CO.UK
    Name Server: NS-1230.AWSDNS-25.ORG
    DNSSEC: unsigned
    URL of the ICANN Whois Inaccuracy Complaint Form: https://www.icann.org/wicf/
    >>> Last update of WHOIS database: 2026-05-08T08:55:54Z <<<
    
    For more information on Whois status codes, please visit https://icann.org/epp
    
    JPRS WHOIS LEGAL DISCLAIMER:
    
    The WHOIS service (the "Service") offered by Japan Registry Services Co.,Ltd. (JPRS) and the access to the records in the JPRS WHOIS database (the "Database") are provided for information purposes and query-based public access.
    
    Neither JPRS nor any of its officers, directors, employees or agents makes any warranty as to the results to be obtained from use of the Service. JPRS specifically disclaims all warranties of any kind, whether express, implied or statutory, including, but not limited to, any warranties of title, non-infringement, merchantability or fitness for a particular purpose.
    In no event shall JPRS nor anyone else involved in creating, supporting, producing or delivering the Service be liable to you for any lost profits or costs, even if JPRS or such person has been advised of the possibility of such damages.
    
    JPRS allows you to use the Service only for lawful purposes and that, under no circumstances shall you use the Service to: (a) allow, enable or otherwise support the transmission by e-mail, telephone, postal mail, facsimile or other means of mass unsolicited, commercial advertising or solicitations to entities other than the data recipient's own existing customers; or (b) enable high volume, automated, electronic processes that send queries or data to the systems of any registry operator or ICANN-accredited registrar, except as reasonably necessary to register domain names or modify existing registrations.
    
    By submitting the query you agree to abide by these terms and further agree that JPRS may take measures to limit the use of the Service in order to protect the privacy of its registrants or the integrity of the Database.
    
    JPRS reserves the right to modify or change these terms at any time without prior or subsequent notification of any kind.
    
    For further information, use 'whois -h whois.jprs.jp help'. To express Japanese output, add '/j' at the end of command, e.g. 'whois -h whois.jprs.jp xxx/j'.
    
    $ traceroute www.shonenjump.com
    traceroute to www.shonenjump.com (202.218.223.232), 30 hops max, 60 byte packets
     1  * _gateway (192.168.64.1)  0.431 ms  0.418 ms
     2  192.168.3.1 (192.168.3.1)  5.078 ms  5.039 ms  4.984 ms
     3  softbank221110222214.bbtec.net (221.110.222.214)  7.263 ms  7.241 ms  7.233 ms
     4  softbank221110222213.bbtec.net (221.110.222.213)  7.225 ms  8.516 ms  8.503 ms
     5  * * *
     6  101.203.70.90 (101.203.70.90)  10.182 ms  9.883 ms  9.856 ms
     7  * * *
     8  * * *
     9  * * *
    10  www.shonenjump.com (202.218.223.232)  9.627 ms  9.622 ms  9.617 ms
    
    $ whois 101.203.70.90
    % [whois.apnic.net]
    % Whois data copyright terms    http://www.apnic.net/db/dbcopyright.html
    
    % Information related to '101.203.64.0 - 101.203.79.255'
    
    % Abuse contact for '101.203.64.0 - 101.203.79.255' is 'hostmaster@nic.ad.jp'
    
    inetnum:        101.203.64.0 - 101.203.79.255
    netname:        BBIXINTLNET
    descr:          BBIX, Inc.
    descr:          ARK Hills Sengokuyama Mori Tower 38F
    descr:          1-9-10 Roppongi, Minato-ku, Tokyo
    descr:          106-0032 Japan
    admin-c:        JNIC1-AP
    tech-c:         JNIC1-AP
    remarks:        Email address for spam or abuse complaints : abuse@bbix.net
    country:        JP
    mnt-by:         MAINT-JPNIC
    mnt-lower:      MAINT-JPNIC
    mnt-irt:        IRT-JPNIC-JP
    status:         ALLOCATED PORTABLE
    last-modified:  2021-03-29T07:24:03Z
    source:         APNIC
    
    irt:            IRT-JPNIC-JP
    address:        Uchikanda OS Bldg 4F, 2-12-6 Uchi-Kanda
    address:        Chiyoda-ku, Tokyo 101-0047, japan
    e-mail:         hostmaster@nic.ad.jp
    abuse-mailbox:  hostmaster@nic.ad.jp
    phone:          +81-3-5297-2311
    fax-no:         +81-3-5297-2312
    admin-c:        JNIC1-AP
    tech-c:         JNIC1-AP
    auth:           # Filtered
    remarks:        hostmaster@nic.ad.jp was validated on 2024-11-27
    mnt-by:         MAINT-JPNIC
    last-modified:  2025-09-04T01:00:00Z
    source:         APNIC
    
    role:           Japan Network Information Center
    address:        Uchikanda OS Bldg 4F, 2-12-6 Uchi-Kanda
    address:        Chiyoda-ku, Tokyo 101-0047, Japan
    country:        JP
    phone:          +81-3-5297-2311
    fax-no:         +81-3-5297-2312
    e-mail:         hostmaster@nic.ad.jp
    admin-c:        JI13-AP
    tech-c:         JE53-AP
    nic-hdl:        JNIC1-AP
    mnt-by:         MAINT-JPNIC
    last-modified:  2022-01-05T03:04:02Z
    source:         APNIC
    
    % Information related to '101.203.64.0 - 101.203.83.255'
    
    inetnum:        101.203.64.0 - 101.203.83.255
    netname:        BBIXINTLNET-CIDR-BLK-JP
    descr:          BBIX, Inc.
    remarks:        Email address for spam or abuse complaints : abuse@bbix.net
    country:        JP
    admin-c:        JP00124734
    tech-c:         JP00124734
    last-modified:  2021-03-30T01:02:36Z
    remarks:        This information has been partially mirrored by APNIC from
    remarks:        JPNIC. To obtain more specific information, please use the
    remarks:        JPNIC WHOIS Gateway at
    remarks:        http://www.nic.ad.jp/en/db/whois/en-gateway.html or
    remarks:        whois.nic.ad.jp for WHOIS client. (The WHOIS client
    remarks:        defaults to Japanese output, use the /e switch for English
    remarks:        output)
    source:         JPNIC
    
    % This query was served by the APNIC Whois Service version 1.88.48 (WHOIS-JP1)

    ```


## 3. パケット解析

Firefox 上で当該 URL を入力して Enter を押してからのパケットを Wireshark を用いてキャプチャした．
また，~/Downloads/sslkey.log を Wireshark に設定した上で，以下のように firefox を起動した．
これにより，TLS handshake 後の暗号化された application data も Wireshark 上で復号し，HTTP/2 frame として確認できるようにした．

https://knowledgebase.paloaltonetworks.com/KCSArticleDetail?id=kA14u000000oM2ECAU&lang=ja

```bash
$ export SSLKEYLOGFILE=~/Downloads/sslkey.log
$ firefox &
```

サイトキャッシュを削除した状態で実行するのは，前章と同様である．
何度か実験した結果，少なくとも Firefox または OS 側で DNS cache が残っていると A レコードのリクエストが飛ばないことが分かったため，Firefox は about:config/networking#dns から，OS 側は `$ resolvectl flush-caches` で systemd-resolved の cache を削除してからキャプチャした結果の冒頭を以下に示す．
https://qiita.com/wmx/items/19a3f76f092f40ae40fb

??? note "パケットキャプチャの冒頭 (1-64)"

    ```text
    1	0.000000000	192.168.64.6	192.168.64.1	DNS	89	Standard query 0xb4ca HTTPS www.shonenjump.com OPT
    2	0.002283115	192.168.64.6	192.168.64.1	DNS	89	Standard query 0x4474 A www.shonenjump.com OPT
    3	0.002662349	192.168.64.6	192.168.64.1	DNS	89	Standard query 0x377a AAAA www.shonenjump.com OPT
    4	0.023094050	192.168.64.1	192.168.64.6	DNS	105	Standard query response 0x4474 A www.shonenjump.com A 202.218.223.232 OPT
    5	0.023921266	192.168.64.1	192.168.64.6	DNS	170	Standard query response 0xb4ca HTTPS www.shonenjump.com SOA ns-816.awsdns-38.net OPT
    6	0.024263168	192.168.64.1	192.168.64.6	DNS	170	Standard query response 0x377a AAAA www.shonenjump.com SOA ns-816.awsdns-38.net OPT
    7	0.025592697	192.168.64.6	202.218.223.232	TCP	74	48122 → 443 [SYN] Seq=0 Win=64240 Len=0 MSS=1460 SACK_PERM TSval=2374061186 TSecr=0 WS=1024
    8	0.034825567	202.218.223.232	192.168.64.6	TCP	74	443 → 48122 [SYN, ACK] Seq=0 Ack=1 Win=28960 Len=0 MSS=1420 SACK_PERM TSval=2491937572 TSecr=2374061186 WS=32
    9	0.034912855	192.168.64.6	202.218.223.232	TCP	66	48122 → 443 [ACK] Seq=1 Ack=1 Win=64512 Len=0 TSval=2374061195 TSecr=2491937572
    10	0.037012394	192.168.64.6	202.218.223.232	TCP	1474	48122 → 443 [ACK] Seq=1 Ack=1 Win=64512 Len=1408 TSval=2374061197 TSecr=2491937572 [TCP segment of a reassembled PDU]
    11	0.037015727	192.168.64.6	202.218.223.232	TLSv1.3	549	Client Hello (SNI=www.shonenjump.com)
    12	0.045482045	202.218.223.232	192.168.64.6	TCP	66	443 → 48122 [ACK] Seq=1 Ack=1409 Win=31872 Len=0 TSval=2491937583 TSecr=2374061197
    13	0.045482378	202.218.223.232	192.168.64.6	TCP	66	443 → 48122 [ACK] Seq=1 Ack=1892 Win=34688 Len=0 TSval=2491937583 TSecr=2374061197
    14	0.052865033	202.218.223.232	192.168.64.6	TLSv1.3	3735	Server Hello, Change Cipher Spec, Encrypted Extensions, Certificate, Certificate Verify, Finished
    15	0.053004652	192.168.64.6	202.218.223.232	TCP	66	48122 → 443 [ACK] Seq=1892 Ack=3670 Win=72704 Len=0 TSval=2374061213 TSecr=2491937590
    16	0.063958534	192.168.64.6	202.218.223.232	TLSv1.3	146	Change Cipher Spec, Finished
    17	0.065043740	192.168.64.6	202.218.223.232	HTTP2	158	Magic, SETTINGS[0], WINDOW_UPDATE[0]
    18	0.070147071	192.168.64.6	202.218.223.232	HTTP2	419	HEADERS[3]: GET /j/weeklyshonenjump/, WINDOW_UPDATE[3]
    19	0.072889667	202.218.223.232	192.168.64.6	TLSv1.3	369	New Session Ticket
    20	0.072889959	202.218.223.232	192.168.64.6	TLSv1.3	369	New Session Ticket
    21	0.072889959	202.218.223.232	192.168.64.6	HTTP2	116	SETTINGS[0], WINDOW_UPDATE[0]
    22	0.073050577	192.168.64.6	202.218.223.232	TCP	66	48122 → 443 [ACK] Seq=2417 Ack=4326 Win=77824 Len=0 TSval=2374061233 TSecr=2491937611
    23	0.073106700	192.168.64.6	202.218.223.232	HTTP2	97	SETTINGS[0]
    24	0.074180072	202.218.223.232	192.168.64.6	HTTP2	97	SETTINGS[0]
    25	0.082160035	202.218.223.232	192.168.64.6	TCP	1474	443 → 48122 [ACK] Seq=4357 Ack=2417 Win=37504 Len=1408 TSval=2491937619 TSecr=2374061230 [TCP segment of a reassembled PDU]
    26	0.082160244	202.218.223.232	192.168.64.6	TCP	1474	[TCP Previous segment not captured] 443 → 48122 [ACK] Seq=7173 Ack=2417 Win=37504 Len=1408 TSval=2491937619 TSecr=2374061230 [TCP segment of a reassembled PDU]
    27	0.082160285	202.218.223.232	192.168.64.6	TCP	1474	[TCP Out-Of-Order] 443 → 48122 [ACK] Seq=5765 Ack=2417 Win=37504 Len=1408 TSval=2491937619 TSecr=2374061230 [TCP segment of a reassembled PDU]
    28	0.082160327	202.218.223.232	192.168.64.6	HTTP2	4290	HEADERS[3]: 200 OK, DATA[3], DATA[3], DATA[3], DATA[3], DATA[3], DATA[3]
    29	0.082160327	202.218.223.232	192.168.64.6	TLSv1.3	5698	DATA[3], DATA[3], DATA[3][TLS segment of a reassembled PDU]
    30	0.082254365	192.168.64.6	202.218.223.232	TCP	66	48122 → 443 [ACK] Seq=2448 Ack=5765 Win=80896 Len=0 TSval=2374061242 TSecr=2491937612
    31	0.082271697	192.168.64.6	202.218.223.232	TCP	78	[TCP Window Update] 48122 → 443 [ACK] Seq=2448 Ack=5765 Win=82944 Len=0 TSval=2374061242 TSecr=2491937612 SLE=7173 SRE=8581
    32	0.082275656	192.168.64.6	202.218.223.232	TCP	66	48122 → 443 [ACK] Seq=2448 Ack=8581 Win=82944 Len=0 TSval=2374061242 TSecr=2491937619
    33	0.082293905	202.218.223.232	192.168.64.6	HTTP2	2882	DATA[3], DATA[3][TLS segment of a reassembled PDU]
    34	0.082394026	192.168.64.6	202.218.223.232	TCP	66	48122 → 443 [ACK] Seq=2448 Ack=21253 Win=73728 Len=0 TSval=2374061243 TSecr=2491937619
    35	0.093017630	202.218.223.232	192.168.64.6	HTTP2	1474	DATA[3]
    36	0.093017922	202.218.223.232	192.168.64.6	TLSv1.3	1474	[TCP Previous segment not captured] , Continuation Data
    37	0.093017922	202.218.223.232	192.168.64.6	TCP	1474	[TCP Out-Of-Order] 443 → 48122 [ACK] Seq=22661 Ack=2448 Win=37504 Len=1408 TSval=2491937629 TSecr=2374061242
    38	0.093017963	202.218.223.232	192.168.64.6	TLSv1.3	4290	Continuation Data
    39	0.093017963	202.218.223.232	192.168.64.6	TLSv1.3	1474	[TCP Previous segment not captured] , Continuation Data
    40	0.093018047	202.218.223.232	192.168.64.6	TCP	1474	[TCP Out-Of-Order] 443 → 48122 [ACK] Seq=29701 Ack=2448 Win=37504 Len=1408 TSval=2491937629 TSecr=2374061243
    41	0.093068003	192.168.64.6	202.218.223.232	TCP	78	48122 → 443 [ACK] Seq=2448 Ack=22661 Win=82944 Len=0 TSval=2374061253 TSecr=2491937629 SLE=24069 SRE=25477
    42	0.093079586	192.168.64.6	202.218.223.232	TCP	66	48122 → 443 [ACK] Seq=2448 Ack=25477 Win=82944 Len=0 TSval=2374061253 TSecr=2491937629
    43	0.093081669	192.168.64.6	202.218.223.232	TCP	78	48122 → 443 [ACK] Seq=2448 Ack=29701 Win=78848 Len=0 TSval=2374061253 TSecr=2491937629 SLE=31109 SRE=32517
    44	0.093083294	192.168.64.6	202.218.223.232	TCP	66	48122 → 443 [ACK] Seq=2448 Ack=32517 Win=77824 Len=0 TSval=2374061253 TSecr=2491937629
    45	0.093085961	202.218.223.232	192.168.64.6	TLSv1.3	1474	Continuation Data
    46	0.093086002	202.218.223.232	192.168.64.6	TLSv1.3	1474	[TCP Previous segment not captured] , Continuation Data
    47	0.093086044	202.218.223.232	192.168.64.6	TCP	1474	[TCP Out-Of-Order] 443 → 48122 [ACK] Seq=33925 Ack=2448 Win=37504 Len=1408 TSval=2491937629 TSecr=2374061243
    48	0.093086044	202.218.223.232	192.168.64.6	TLSv1.3	5651	Continuation Data
    49	0.093094502	192.168.64.6	202.218.223.232	TCP	78	48122 → 443 [ACK] Seq=2448 Ack=33925 Win=76800 Len=0 TSval=2374061253 TSecr=2491937629 SLE=35333 SRE=36741
    50	0.093096252	192.168.64.6	202.218.223.232	TCP	66	48122 → 443 [ACK] Seq=2448 Ack=36741 Win=74752 Len=0 TSval=2374061253 TSecr=2491937629
    51	0.093107210	192.168.64.6	202.218.223.232	TCP	66	48122 → 443 [ACK] Seq=2448 Ack=42326 Win=70656 Len=0 TSval=2374061253 TSecr=2491937629
    52	0.347868766	192.168.64.6	202.218.223.232	HTTP2	228	HEADERS[5]: GET /j/common/css/common.css, WINDOW_UPDATE[5]
    53	0.350961055	192.168.64.6	202.218.223.232	HTTP2	151	HEADERS[7]: GET /j/common/css/common_all.css, WINDOW_UPDATE[7]
    54	0.366424335	202.218.223.232	192.168.64.6	TLSv1.3	3882	Application Data
    55	0.366424544	202.218.223.232	192.168.64.6	TLSv1.3	3486	Application Data
    56	0.366546039	192.168.64.6	202.218.223.232	TCP	66	48122 → 443 [ACK] Seq=2695 Ack=49562 Win=79872 Len=0 TSval=2374061527 TSecr=2491937896
    57	0.369254886	192.168.64.6	202.218.223.232	HTTP2	150	HEADERS[9]: GET /j/common/css/common_pc.css, WINDOW_UPDATE[9]
    58	0.370356924	192.168.64.6	202.218.223.232	HTTP2	164	HEADERS[11]: GET /j/weeklyshonenjump/css/weeklyshonenjump.css, WINDOW_UPDATE[11]
    59	0.372302302	192.168.64.6	202.218.223.232	HTTP2	166	HEADERS[13]: GET /j/weeklyshonenjump/css/weeklyshonenjump_sp.css, WINDOW_UPDATE[13]
    60	0.373985274	192.168.64.6	202.218.223.232	HTTP2	150	HEADERS[15]: GET /j/common/css/common_sp.css, WINDOW_UPDATE[15]
    61	0.375088687	192.168.64.6	202.218.223.232	HTTP2	147	HEADERS[17]: GET /j/css/slick-theme.css, WINDOW_UPDATE[17]
    62	0.375941985	192.168.64.6	202.218.223.232	HTTP2	143	HEADERS[19]: GET /j/css/slick.css, WINDOW_UPDATE[19]
    63	0.376976193	192.168.64.6	202.218.223.232	HTTP2	157	HEADERS[21]: GET /j/js/jquery.min.js, WINDOW_UPDATE[21]
    64	0.378252182	192.168.64.6	202.218.223.232	HTTP2	141	HEADERS[23]: GET /j/js/ppvn.js, WINDOW_UPDATE[23]
    ```

重要な部分を拾うと以下の通り．

1. DNS (1-6)
2. TCP handshake (7-9)
3. TLS handshake<br>
  3.1. Client Hello (11) (Client -> Server) <br>
  3.2. Server Hello, Change Cipher Spec, Encrypted Extensions, Certificate, Certificate Verify, Finished (14) (Server -> Client)<br>
  3.3. Change Cipher Spec, Finished (16) (Client -> Server)<br>
  (3.4. New Session Ticket (19, 20) (Server -> Client) )<br>
4. HTTP/2<br>
  4.1. Magic, SETTINGS[0], WINDOW_UPDATE[0] (17) (Client -> Server)<br>
  4.2. HEADERS[3]: GET /j/weeklyshonenjump/, WINDOW_UPDATE[3] (18) (Client -> Server)<br>
  4.3. SETTINGS[0], WINDOW_UPDATE[0] (21) (Server -> Client)<br>
  4.4. HEADERS[3]: 200 OK, DATA[3], DATA[3], DATA[3], DATA[3], DATA[3], DATA[3] (28) (Server -> Client)<br>
  4.5. HEADERS[5]: GET /j/common/css/common.css, WINDOW_UPDATE[5] (52) (Client -> Server)

キャプチャしたパケットの下の方に行くと，外部ドメインの HTTP3 パケットも観測されたが，ここでは www.shonenjump.com との通信に焦点を置く．

### 3.1. DNS
(要約) HTTPS/A/AAAA レコードの順にリクエストが投げられ，A レコードのみ 202.218.223.232 と結果を得られた．

まず，Firefox の設定を確認すると DNS over HTTPS が無効になっていた．そのため，平文で DNS が実行されたものと考えられる．
HTTPS,A,AAAA レコードのリクエストが観測できる．各レコードについて見ていく．

まず，HTTPS RR のパケットが飛んでいる．HTTPS RR は，SVCB RR と同じ形式で，alpn や echconfig などの SvcParam を DNS から事前に配布できる．これにより，接続前に HTTP/3 対応や ECH の設定などを知ることができる．
https://www.nic.ad.jp/ja/materials/iw/2021/proceedings/c2/c2-matsumoto-3.pdf

このレコードは Answer RRs: 0 であったが，RFC 2308 に従って Answer がない場合でも，authority section の SOA record に基づいて negative response が一定時間 cache されうる．これをネガティブキャッシュという．
https://www.dnsops.jp/event/20120831/DNS-RFC-PRIMER-2.pdf#page=171

https://datatracker.ietf.org/doc/html/rfc2308#section-8
>  The SOA record from the authority section MUST be cached.  Name error
   indications must be cached against the tuple &lt;query name, QCLASS&gt;.
   No data indications must be cached against &lt;query name, QTYPE,
   QCLASS&gt; tuple.

なお，`$ resolvectl show-cache` を実行してもキャッシュは表示されない．MacOS 側の DNS キャッシュも削除してから `$ dig www.shonenjump.com -t HTTPS` を 2 度実行した所，23ms -> 2ms となったため，経路上のどこかでは negative response もキャッシュされていると推測できる．

次に，HTTPS の結果を見る前から A レコードのパケットが飛んでいる．

先ほどは UDP Source Port: 54508 だったが，このパケットは 48198 となっている．これは 16bit の Transaction ID に加えて，同じく 16bit Source Port をランダムにすることによって，カミンスキー型 DNS キャッシュポイズニング攻撃を防ぐ RFC 5452 で定義された手法である．
https://jprs.jp/tech/security/2014-04-30-poisoning-countermeasure-resolver-1.pdf
https://datatracker.ietf.org/doc/html/rfc5452

このレコードは Answer RRs: 1 であり，202.218.223.232 と返ってきている．

続いて，AAAA レコードのパケットが飛んでいる．A/AAAA レコードはほぼ同時に投げられていることがわかる．
これは RFC 8305 で定義されている Happy Eyeballs Version 2 の考え方と整合するが，具体的な順序は resolver 実装にも依存する．AAAA が先，A が後と書かれているが，観測されたパケットは僅かに A レコードの方が先のようだ．
何度か実験したが，HTTPS/A/AAAA が全て登場した 3 件全てで HTTPS -> (0.2-2ms) A ->(0.2-0.4ms) AAAA の順番となっているから，同時に実行した場合のブレではなさそうだ．
この原因は 4. Firefox 解析で調べることにする．

>  When a client has both IPv4 and IPv6 connectivity and is trying to
   establish a connection with a named host, it needs to send out both
   AAAA and A DNS queries.  Both queries SHOULD be made as soon after
   one another as possible, with the AAAA query made first and
   immediately followed by the A query.

https://datatracker.ietf.org/doc/html/rfc8305#section-3
こちらも HTTPS 同様に Answer RRs: 0 であった．

よって，IPv4 アドレスのみ得られたため，今後は 202.218.223.232 へ接続していくことになる．

### 3.2. TCP handshake

```text
7	0.025592697	192.168.64.6	202.218.223.232	TCP	74	48122 → 443 [SYN] Seq=0 Win=64240 Len=0 MSS=1460 SACK_PERM TSval=2374061186 TSecr=0 WS=1024
8	0.034825567	202.218.223.232	192.168.64.6	TCP	74	443 → 48122 [SYN, ACK] Seq=0 Ack=1 Win=28960 Len=0 MSS=1420 SACK_PERM TSval=2491937572 TSecr=2374061186 WS=32
9	0.034912855	192.168.64.6	202.218.223.232	TCP	66	48122 → 443 [ACK] Seq=1 Ack=1 Win=64512 Len=0 TSval=2374061195 TSecr=2491937572
```
7-9 パケットにおいて，SYN -> SYN/ACK -> ACK という TCP 3-way handshake が行われた．

やり取りの内容は主に以下の通り．

- MSS(Maximum Segment Size):
Client 1460 bytes, Server 1420 bytes であった．通常は MTU(Maximum Transmission Unit) が 1500 bytes で IP,TCP ヘッダそれぞれ 20 bytes を引いて MSS 1460 bytes であるが，サーバ側はさらに 40 bytes 少なかった．経路上またはサーバ側ネットワークで MTU/MSS が調整されている可能性があるが，今回の観測だけでは原因は特定できない．
IDCF 内部でのカプセル化によるオーバーヘッドのため，TCP MSS Clamping により MSS が通常より小さく設定されているという可能性も考えられる．

- Window Scale: Window Size として指定した値を 2^(shift) に拡大できる．Client: 10(1024), Server: 5(32)
- SACK Permitted: 再送を要求する際に，既に受信したシーケンス番号の範囲を示すことで，無駄をなくす仕組みである．Client, Server ともに Permitted．

https://milestone-of-se.nesuke.com/nw-basic/tcp-udp/tcp-option/

なお，キャプチャにおいては (TCP Previous segment not captured, TCP Out-Of-Order) の組がいくつか現れていた．
これらは必ずしもパケットロスを意味せず，Seq# や時刻を見ると小さな到着順の入れ替わりに見える．原因としては，キャプチャ・仮想化・オフロード由来の可能性が高く，実ネットワーク上の並行経路も理論上ありうると考えられる．

### 3.3. TLS handshake
(要約) TLSv1.3 Handshake の内容を各 Record について調べた．ALPN により HTTP/2 を使うことになった．また，New Session Ticket についても確認した．

```text
11	0.037015727	192.168.64.6	202.218.223.232	TLSv1.3	549	Client Hello (SNI=www.shonenjump.com)
14	0.052865033	202.218.223.232	192.168.64.6	TLSv1.3	3735	Server Hello, Change Cipher Spec, Encrypted Extensions, Certificate, Certificate Verify, Finished
16	0.063958534	192.168.64.6	202.218.223.232	TLSv1.3	146	Change Cipher Spec, Finished
19	0.072889667	202.218.223.232	192.168.64.6	TLSv1.3	369	New Session Ticket
20	0.072889959	202.218.223.232	192.168.64.6	TLSv1.3	369	New Session Ticket
```

観察されたパケットでは次のように handshake を行なっていた．パケットごとにまとめて見ていく．

1. Client Hello (Client -> Server)
2. Server Hello (以下 6 まで Server -> Client)
(Change Cipher Spec)
3. Encrypted Extensions
4. Certificate
5. Certificate Verify
6. Finished
(Change Cipher Spec) (以下 Client -> Server)
7. Finished

#### 3.3.1. Client Hello

まず record において TLSv1.0 だったり Handshake で TLSv1.2 だったりと，実際には TLSv1.3 を使っているはずなのにバラバラなことが観察される．
これは古い機器が TLSv1.3 を破棄しないための仕組みであり，supported_versions で TLSv1.3,v1.2 が指定されていることがわかる．

Record Layer: TLS v1.0 (0x0301)
https://datatracker.ietf.org/doc/html/rfc8446#section-5.1
>   legacy_record_version:  MUST be set to 0x0303 for all records
    generated by a TLS 1.3 implementation other than an initial
    ClientHello (i.e., one not generated after a HelloRetryRequest),
    where it MAY also be 0x0301 for compatibility purposes.  This
    field is deprecated and MUST be ignored for all purposes.
    Previous versions of TLS would use other values in this field
    under some circumstances.

Client Hello: TLS v1.2 (0x0303)
https://datatracker.ietf.org/doc/html/rfc8446#section-4.1.2
>   legacy_version:  In previous versions of TLS, this field was used for
    version negotiation and represented the highest version number
    supported by the client.  Experience has shown that many servers
    do not properly implement version negotiation, leading to "version
    intolerance" in which the server rejects an otherwise acceptable
    ClientHello with a version number higher than it supports.  In
    TLS 1.3, the client indicates its version preferences in the
    "supported_versions" extension (Section 4.2.1) and the
    legacy_version field MUST be set to 0x0303, which is the version
    number for TLS 1.2.  TLS 1.3 ClientHellos are identified as having
    a legacy_version of 0x0303 and a supported_versions extension
    present with 0x0304 as the highest version indicated therein.
    (See Appendix D for details about backward compatibility.)

```text
Extension: supported_versions (len=5) TLS 1.3, TLS 1.2
    Type: supported_versions (43)
    Length: 5
    Supported Versions length: 4
    Supported Version: TLS 1.3 (0x0304)
    Supported Version: TLS 1.2 (0x0303)
```

同様に version を調整する拡張として，ALPN(Application Layer Protocol Negotiation) がある．h2(HTTP/2) 及び http/1.1 を指定していることがわかる．
これらの情報は次の　Encrypted Extensions で Server からも指定されて，Protocol Negotiation が完了することになる．

```text
Extension: application_layer_protocol_negotiation (len=14)
    Type: application_layer_protocol_negotiation (16)
    Length: 14
    ALPN Extension Length: 12
    ALPN Protocol
        ALPN string length: 2
        ALPN Next Protocol: h2
        ALPN string length: 8
        ALPN Next Protocol: http/1.1
```

バージョン以外の情報も見ていくと，Cipher Suites, SNI, keyshare などを送っていることがわかる．

Cipher Suites は TLSv1.3 では共通鍵方式とハッシュアルゴリズム方式の組を指定している．
https://qiita.com/kj1/items/ad98c124cb4fbc9b2cc7

また，keyshare を見ると "Unknown" group があるが，4588 に割り当てられているのは X25519MLKEM768 という ML-KEM-768(Post-Quantum Cryptography, PQC) と X25519(Diffie-Hellman) からなるハイブリッド方式のようである．

> 7.1.  X25519MLKEM768
>
   Value:  4588 (0x11EC) <br>
   Description:  X25519MLKEM768 <br>
   DTLS-OK:  Y <br>
   Recommended:  N <br>
   Reference:  This document <br>
   Comment:  Combining X25519 ECDH with ML-KEM-768
   
https://datatracker.ietf.org/doc/draft-ietf-tls-ecdhe-mlkem/

実は Client Hello は 0-1407 bytes がパケット 10，1408-1890 がパケット 11 に分割されて 1891 bytes であるが，これが 1216 bytes 使っている．（Server Hello でわかるが，結局使わなかった）．

なお，この PQC によるフラグメンテーション問題は，実際に移行の際の問題となっている．

> PQC 移行の難易度を上げている技術的特性の一つは、そのデータサイズである。PQC アルゴリズムは RSA な
どと比較して鍵長や署名サイズが数倍から数十倍大きくなり、既存のプロトコルや証明書仕様が前提とするメッセー
ジ長や処理能力の限界を超える可能性がある。つまり、PQC のデータサイズが原因で、通信・処理・保存のすべて
に負荷がかかり、既存システムの設計を根本から見直す必要が出てくるということだ。

https://eng-blog.iij.ad.jp/archives/35451
https://www.pwc.com/jp/ja/services/consulting/intelligence/assets/pdf/emerging-technology-insights250919.pdf

また，HTTPS レコードがなかったにも関わらず，Encrypted Client Hello(ECH) に値が埋まっていて不思議に思ったが，これは RFC 9849 TLS Encrypted Client Hello で説明されており，GREASE(Generate Random Extensions And Sustain Extensibility) と呼ばれ，使わなくてもダミー値を入れておくことで，実際に ECH を使うときに壊れないようにする仕組みである．

> 6.Client Behavior
>
   Clients that implement the ECH extension behave in one of two ways:
   either they offer a real ECH extension, as described in Section 6.1,
   or they send a Generate Random Extensions And Sustain Extensibility
   (GREASE) [RFC8701] ECH extension, as described in Section 6.2.  The
   client offers ECH if it is in possession of a compatible ECH
   configuration and sends GREASE ECH (see Section 6.2) otherwise.
   Clients of the latter type do not negotiate ECH; instead, they
   generate a dummy ECH extension that is ignored by the server.  (See
   Section 10.10.4 for an explanation.)  It is also possible for clients
   to always send GREASE ECH without implementing the remainder of this
   specification. <br>



> 10.10.4.  Do Not Stick Out <br>
   (中略) <br>
   The GREASE ECH protocol described in Section 6.2 provides a low-risk
   way to evaluate the deployability of ECH.  It is designed to mimic
   the real ECH protocol (Section 6.1) without changing the security
   properties of the handshake.  The underlying theory is that if GREASE
   ECH is deployable without triggering middlebox misbehavior, and real
   ECH looks enough like GREASE ECH, then ECH should be deployable as
   well.  Thus, the strategy for mitigating network ossification is to
   deploy GREASE ECH widely enough to disincentivize differential
   treatment of the real ECH protocol by the network.

https://datatracker.ietf.org/doc/rfc9849/

その他の主な Extension は以下の通り．

- supported_groups: 鍵交換で使用するアルゴリズムグループ (x25519 などが書かれていた)
- signature_algorithms: 鍵交換と証明書のデジタル署名 (ecdsa_secp256r1_sha256 などが書かれていた)
- status_request: 証明書が有効かどうかの検証方法指定，パケットでは OCSP だった．

https://zenn.dev/arailly/books/41061020f0cfaa/viewer/94fefb

```text
Cipher Suites (16 suites)
    Cipher Suite: TLS_AES_128_GCM_SHA256 (0x1301)
    Cipher Suite: TLS_CHACHA20_POLY1305_SHA256 (0x1303)
    Cipher Suite: TLS_AES_256_GCM_SHA384 (0x1302)
    Cipher Suite: TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256 (0xc02b)
    Cipher Suite: TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 (0xc02f)
    Cipher Suite: TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256 (0xcca9)
    Cipher Suite: TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256 (0xcca8)
    Cipher Suite: TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384 (0xc02c)
    Cipher Suite: TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 (0xc030)
    Cipher Suite: TLS_ECDHE_ECDSA_WITH_AES_256_CBC_SHA (0xc00a)
    Cipher Suite: TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA (0xc013)
    Cipher Suite: TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA (0xc014)
    Cipher Suite: TLS_RSA_WITH_AES_128_GCM_SHA256 (0x009c)
    Cipher Suite: TLS_RSA_WITH_AES_256_GCM_SHA384 (0x009d)
    Cipher Suite: TLS_RSA_WITH_AES_128_CBC_SHA (0x002f)
    Cipher Suite: TLS_RSA_WITH_AES_256_CBC_SHA (0x0035)
```
```text
Extension: server_name (len=23) name=www.shonenjump.com
    Type: server_name (0)
    Length: 23
    Server Name Indication extension
        Server Name list length: 21
        Server Name Type: host_name (0)
        Server Name length: 18
        Server Name: www.shonenjump.com
```
```text
Extension: key_share (len=1327) Unknown (4588), x25519, secp256r1
    Type: key_share (51)
    Length: 1327
    Key Share extension
        Client Key Share Length: 1325
        Key Share Entry: Group: Unknown (4588), Key Exchange length: 1216
            Group: Unknown (4588)
            Key Exchange Length: 1216
            Key Exchange [truncated]: 3bb10487249537f75ddc402ee1d649df52567d1914ca3836ee8b7fcf9bcc326a372fd677047b6709867b49b983a0492829b5480d8b66fee0c265b9b4cea469085630fe16434d23a399b00d99f771e71704ca671c1a765c1820748ac35466f8c37db619e0a70dba296fadd
        Key Share Entry: Group: x25519, Key Exchange length: 32
            Group: x25519 (29)
            Key Exchange Length: 32
            Key Exchange: ba9904e30fa18aa755449338556ba8366c43fab8b8492dd3fad7fcb9e565fe26
        Key Share Entry: Group: secp256r1, Key Exchange length: 65
            Group: secp256r1 (23)
            Key Exchange Length: 65
            Key Exchange: 04dfbf43c2a905842e9cbbf972ad6cbe007cc11f7dfe3c62ca0b0a75ba528ae41df5cd8fd7d184095c1c642b0f06afe9e0d3b5aa361cec2c13c74af38c39e1b466
```


#### 3.3.2. Server Hello, Change Cipher Spec, Encrypted Extensions, Certificate, Certificate Verify, Finished

(Server Hello)
以下の事柄がわかるが，これらは 2. 情報収集 で得られた情報と一致している．

- Client Hello で送った Cipher Suites の中から TLS_AES_256_GCM_SHA384 が選ばれた
- Client Hello で送った supported_versions の中から TLSv1.3 が選ばれた
- Client Hello で送った supported_groups の中から x25519 が選ばれ，サーバ側から keyshare された

```text
Handshake Protocol: Server Hello
    Handshake Type: Server Hello (2)
    Length: 118
    Version: TLS 1.2 (0x0303)
    Random: 4e056eee407949fb27458a18ff55bce9e5fe39f33b65f740f77a132044d23113
    Session ID Length: 32
    Session ID: f74acace72d2af436985a590a9710155fa2499e8fb37b6912a60020f06ba3aae
    Cipher Suite: TLS_AES_256_GCM_SHA384 (0x1302)
    Compression Method: null (0)
    Extensions Length: 46
    Extension: supported_versions (len=2) TLS 1.3
        Type: supported_versions (43)
        Length: 2
        Supported Version: TLS 1.3 (0x0304)
    Extension: key_share (len=36) x25519
    [JA3S Fullstring: 771,4866,43-51]
    [JA3S: 15af977ce25de452b96affa2addb1036]
```

(Change Cipher Spec)
これは TLSv1.3 では不要なものの，Middlebox の互換性のために一応置かれている．先ほどの Record が TLSv1.0 だったり TLSv1.2 だったりを名乗るのと同様の事情である．
https://datatracker.ietf.org/doc/html/rfc8446#appendix-D.4

(Encrypted Extensions)
重要なことは，ALPN で h2(HTTP/2) が選ばれたことである．

```text
TLSv1.3 Record Layer: Handshake Protocol: Encrypted Extensions
    Opaque Type: Application Data (23)
    Version: TLS 1.2 (0x0303)
    Length: 36
    [Content Type: Handshake (22)]
    Handshake Protocol: Encrypted Extensions
        Handshake Type: Encrypted Extensions (8)
        Length: 15
        Extensions Length: 13
        Extension: server_name (len=0)
        Extension: application_layer_protocol_negotiation (len=5)
            Type: application_layer_protocol_negotiation (16)
            Length: 5
            ALPN Extension Length: 3
            ALPN Protocol
                ALPN string length: 2
                ALPN Next Protocol: h2
```

(Certificate)
証明書は \*.shonenjump.com のものと R13 のものが送られてきており，署名は ISRG Root X1 -> R13 -> \*.shonenjump.com という連鎖になっている．
R13 は Let's Encrypt の中間認証局であり，RSA を使用する．
https://letsencrypt.org/ja/certificates/

ISRG Root X1 の公開鍵は既にローカルにある．
```text
$ ls /usr/share/ca-certificates/mozilla/ISRG_Root_X*
/usr/share/ca-certificates/mozilla/ISRG_Root_X1.crt
/usr/share/ca-certificates/mozilla/ISRG_Root_X2.crt
```
```text
signature (sha256WithRSAEncryption)
    Algorithm Id: 1.2.840.113549.1.1.11 (sha256WithRSAEncryption)
```

有効期限も切れていないことがわかる．
```text
validity
    notBefore: utcTime (0)
        utcTime: 2026-04-07 14:13:18 (UTC)
    notAfter: utcTime (0)
        utcTime: 2026-07-06 14:13:17 (UTC)
```

後の検証で用いることができる公開鍵，及び CA からの署名も含まれている．
```text
subjectPublicKeyInfo
    algorithm (rsaEncryption)
        Algorithm Id: 1.2.840.113549.1.1.1 (rsaEncryption)
    subjectPublicKey [truncated]: 3082020a0282020100af7d3498834fe7201d869410e723dff81e71b35d676a3647e5859d60a6df0328607fcff9139b725026f5897389b823e64ddada8715a5ed34fcd04628661b784a1e202e21a474441fbb75ae98a71280e15b8c04eb2603fc91d9a2e525f003bd4
        modulus: 0x00af7d3498834fe7201d869410e723dff81e71b35d676a3647e5859d60a6df0328607fcf…
        publicExponent: 65537
```
```text
encrypted [truncated]: 5bcf1087a899bea339cdf23af4f433dc05b5570f32339bf1ad25ab0275d4f498cb5e5286baf709f40e35f5f1ccf054a064c37a898c9d9cc5d0aa1d084b11e440f8f3df9faa29df9fda0cfa070e5acba5b6227311d330aa1329ab7092332f3049cc5143f36124aadc9cc3c2d1
```

(Certificate Verify)
アルゴリズムは rsa_pss_rsae_sha256 が用いられており，これも 2. 情報収集と一致する．
送られている Signature はサーバの秘密鍵によって生成された，これまで送った Handshake の Hash のデジタル署名であり，これを先ほどの公開鍵で検証することで，サーバが証明書の本人であることが検証できる．

他の検証項目は次の通り．

- 証明書は有効か: 日時で判定
- 証明書を信頼できるか: 先ほどの Chain of Trust
- 証明書が改竄されていないか: 先ほどの CA からの署名を CA の証明書に含まれる公開鍵で検証できる

https://zenn.dev/arailly/books/41061020f0cfaa/viewer/f9e739

```text
TLSv1.3 Record Layer: Handshake Protocol: Certificate Verify
    Opaque Type: Application Data (23)
    Version: TLS 1.2 (0x0303)
    Length: 537
    [Content Type: Handshake (22)]
    Handshake Protocol: Certificate Verify
        Handshake Type: Certificate Verify (15)
        Length: 516
        Signature Algorithm: rsa_pss_rsae_sha256 (0x0804)
            Signature Hash Algorithm Hash: Unknown (8)
            Signature Hash Algorithm Signature: SM2 (4)
        Signature length: 512
        Signature [truncated]: 093b110becd8ea0da700ceb73d82b9319748c1449f2476bac5ac1f985ee8cb48c213b29a82e5627d46a5f7ac25ffc88a1c95b982eda768b1810275a4c62e17e9cbd0df46c837985ef87667158ab2ba0e9486b2e1e495ce14f07033156d319c13625beeac56d904a3f2422120
```

(Finished)
最後に，これまでの handshake の HMAC である Verify Data を送る．これにより，これまでのやり取りが全て改竄されていないことが Client に検証できる．

https://qiita.com/yasushi-jp/items/48709c2c2ce2f5a8e244#26-finished%E3%82%B5%E3%83%BC%E3%83%90--%E3%82%AF%E3%83%A9%E3%82%A4%E3%82%A2%E3%83%B3%E3%83%88

```text
TLSv1.3 Record Layer: Handshake Protocol: Finished
    Opaque Type: Application Data (23)
    Version: TLS 1.2 (0x0303)
    Length: 69
    [Content Type: Handshake (22)]
    Handshake Protocol: Finished
        Handshake Type: Finished (20)
        Length: 48
        Verify Data
```

#### 3.3.3. Change Cipher Spec, Finished

Change Cipher Spec は Server のときと同様に，TLSv1.2 の名残である．Finished は Server と同様に，これまでの handshake の HMAC である．

```text
Transport Layer Security
    TLSv1.3 Record Layer: Change Cipher Spec Protocol: Change Cipher Spec
        Content Type: Change Cipher Spec (20)
        Version: TLS 1.2 (0x0303)
        Length: 1
        Change Cipher Spec Message
    TLSv1.3 Record Layer: Handshake Protocol: Finished
        Opaque Type: Application Data (23)
        Version: TLS 1.2 (0x0303)
        Length: 69
        [Content Type: Handshake (22)]
        Handshake Protocol: Finished
            Handshake Type: Finished (20)
            Length: 48
            Verify Data
```

ここまでで TLSv1.3 handshake は完了で，次のパケットから HTTP/2 が始まるが（本当は一緒でも良いが分かれていた），途中に挟まる New Session Ticket についても確認しておく．

#### 3.3.4. New Session Ticket

New Session Ticket は暗号化通信開始後にいつでも送れ，Pre-Shared Key を得ることで Session 再開に用いることができる．
2 件の Ticket が発行されている理由はサーバの実装依存だが，Ticket は Replay 攻撃への対策として Single-Use が規定されていることから，複数接続を考慮してのことと考えられる．

https://milestone-of-se.nesuke.com/nw-basic/tls/tls-version-1-3/
https://datatracker.ietf.org/doc/html/rfc8446#section-8.1

```text
TLS Session Ticket
    Session Ticket Lifetime Hint: 300 seconds (5 minutes)
    Session Ticket Age Add: 900990142
    Session Ticket Nonce Length: 8
    Session Ticket Nonce: 0000000000000001
    Session Ticket Length: 256
    Session Ticket [truncated]: a92b2ace74cd21fe5e9531376d5e80a438972808d061bcf0161fa579d285d7203b794754bc1d3cce9e8560e6f1b2d81308c9c0a982ef7542187ac22800f8baffeaf5b1e2dfe97430d178becbf1b6194c8eb2347cae2410182d78869985269af8701075f04bc78564096
    Extensions Length: 0
```

### 3.4. HTTP/2
(要約) HTTP/2 接続初期設定後 StreamID 3 で TopPage に GET し，続いて奇数 ID Stream で並列に追加リソースを GET した．

```text
17	0.065043740	192.168.64.6	202.218.223.232	HTTP2	158	Magic, SETTINGS[0], WINDOW_UPDATE[0]
18	0.070147071	192.168.64.6	202.218.223.232	HTTP2	419	HEADERS[3]: GET /j/weeklyshonenjump/, WINDOW_UPDATE[3]
21	0.072889959	202.218.223.232	192.168.64.6	HTTP2	116	SETTINGS[0], WINDOW_UPDATE[0]
23	0.073106700	192.168.64.6	202.218.223.232	HTTP2	97	SETTINGS[0]
24	0.074180072	202.218.223.232	192.168.64.6	HTTP2	97	SETTINGS[0]
28	0.082160327	202.218.223.232	192.168.64.6	HTTP2	4290	HEADERS[3]: 200 OK, DATA[3], DATA[3], DATA[3], DATA[3], DATA[3], DATA[3]
29	0.082160327	202.218.223.232	192.168.64.6	TLSv1.3	5698	DATA[3], DATA[3], DATA[3][TLS segment of a reassembled PDU]
33	0.082293905	202.218.223.232	192.168.64.6	HTTP2	2882	DATA[3], DATA[3][TLS segment of a reassembled PDU]
35	0.093017630	202.218.223.232	192.168.64.6	HTTP2	1474	DATA[3]
52	0.347868766	192.168.64.6	202.218.223.232	HTTP2	228	HEADERS[5]: GET /j/common/css/common.css, WINDOW_UPDATE[5]
53	0.350961055	192.168.64.6	202.218.223.232	HTTP2	151	HEADERS[7]: GET /j/common/css/common_all.css, WINDOW_UPDATE[7]
59	0.372302302	192.168.64.6	202.218.223.232	HTTP2	166	HEADERS[13]: GET /j/weeklyshonenjump/css/weeklyshonenjump_sp.css, WINDOW_UPDATE[13]
60	0.373985274	192.168.64.6	202.218.223.232	HTTP2	150	HEADERS[15]: GET /j/common/css/common_sp.css, WINDOW_UPDATE[15]
61	0.375088687	192.168.64.6	202.218.223.232	HTTP2	147	HEADERS[17]: GET /j/css/slick-theme.css, WINDOW_UPDATE[17]
62	0.375941985	192.168.64.6	202.218.223.232	HTTP2	143	HEADERS[19]: GET /j/css/slick.css, WINDOW_UPDATE[19]
63	0.376976193	192.168.64.6	202.218.223.232	HTTP2	157	HEADERS[21]: GET /j/js/jquery.min.js, WINDOW_UPDATE[21]
64	0.378252182	192.168.64.6	202.218.223.232	HTTP2	141	HEADERS[23]: GET /j/js/ppvn.js, WINDOW_UPDATE[23]
```

(再掲)

1. Magic, SETTINGS[0], WINDOW_UPDATE[0] (17) (Client -> Server)
2. HEADERS[3]: GET /j/weeklyshonenjump/, WINDOW_UPDATE[3] (18) (Client -> Server)
3. SETTINGS[0], WINDOW_UPDATE[0] (21) (Server -> Client)
4. HEADERS[3]: 200 OK, DATA[3], DATA[3], DATA[3], DATA[3], DATA[3], DATA[3] (28) (Server -> Client)
5. HEADERS[5]: GET /j/common/css/common.css, WINDOW_UPDATE[5] (52) (Client -> Server)


TLS handshake が終わると，いよいよ HTTP/2 を用いてコンテンツの取得が始まる．

#### 3.4.1. Magic, SETTINGS[0], WINDOW_UPDATE[0]

(Magic)
まず Connection Preface と呼ばれる固定文字列が送られる．これは HTTP/1.1 サーバに繋がっても \r\n を終端文字列として素早く切断するための文字列である．
https://datatracker.ietf.org/doc/html/rfc7540#section-3.5
https://asnokaze.hatenablog.com/entry/20150226/1424962551
```text
HyperText Transfer Protocol 2
    Stream: Magic
        Magic: PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n
```

(SETTINGS[0])
次に，SETTINGS Stream Id: 0 で接続全体のパラメータを設定する．

- Header table size: Header 圧縮テーブルのメモリサイズを設定している．Default が 4096 bytes であることを考えると大きい設定であり，高速化に寄与する．
- Enable PUSH:
Server -> Client PUSH 機能だが，互換性や実装バグの問題で Firefox 132 で廃止となった．
https://developer.mozilla.org/ja/docs/Mozilla/Firefox/Releases/132
https://bugzilla.mozilla.org/show_bug.cgi?id=1915848

- Initial Windows size: 全てのストリームの Window Size (バッファサイズ)の初期値を設定　
- Max frame size: フレームサイズの最大値を設定

https://datatracker.ietf.org/doc/html/rfc7540#section-6.5.2

```text
HyperText Transfer Protocol 2
    Stream: SETTINGS, Stream ID: 0, Length 24
        Length: 24
        Type: SETTINGS (4)
        Flags: 0x00
            0000 000. = Unused: 0x00
            .... ...0 = ACK: False
        0... .... .... .... .... .... .... .... = Reserved: 0x0
        .000 0000 0000 0000 0000 0000 0000 0000 = Stream Identifier: 0
        Settings - Header table size : 65536
            Settings Identifier: Header table size (1)
            Header table size: 65536
        Settings - Enable PUSH : 0
            Settings Identifier: Enable PUSH (2)
            Enable PUSH: 0
        Settings - Initial Windows size : 131072
            Settings Identifier: Initial Windows size (4)
            Initial Window Size: 131072
        Settings - Max frame size : 16384
            Settings Identifier: Max frame size (5)
            Max frame size: 16384
```

なお，SETTINGS Stream については Client からの送信については Server から，Server からの送信については Client から ACK を送っていることに注意する．
この場合は Packet 23, 24 に対応する．
```text
Stream: SETTINGS, Stream ID: 0, Length 0
    Length: 0
    Type: SETTINGS (4)
    Flags: 0x01, ACK
        0000 000. = Unused: 0x00
        .... ...1 = ACK: True
    0... .... .... .... .... .... .... .... = Reserved: 0x0
    .000 0000 0000 0000 0000 0000 0000 0000 = Stream Identifier: 0
```

(WINDOW_UPDATE[0])
続いて，Stream Id: 0 より，全体の Server -> Client Window Size を 12MB に増やす．

https://datatracker.ietf.org/doc/html/rfc7540#section-6.9

```text
HyperText Transfer Protocol 2
    Stream: WINDOW_UPDATE, Stream ID: 0, Length 4
        Length: 4
        Type: WINDOW_UPDATE (8)
        Flags: 0x00
        0... .... .... .... .... .... .... .... = Reserved: 0x0
        .000 0000 0000 0000 0000 0000 0000 0000 = Stream Identifier: 0
        0... .... .... .... .... .... .... .... = Reserved: 0x0
        .000 0000 1011 1111 0000 0000 0000 0001 = Window Size Increment: 12517377
        [Connection window size (before): 65535]
        [Connection window size (after): 12582912]
```

#### 3.4.2. HEADERS[3]: GET /j/weeklyshonenjump/, WINDOW_UPDATE[3]

全体の設定をした所で，Client 開始の Stream は奇数 Stream ID，Server 開始の Stream は偶数 Stream ID を使って通信していく．
この GET は Stream ID: 1 を使っても良いはずであるが，Stream ID: 3 から始まっている．これは繰り返し実験しても変わらない挙動のようであった．

curl で実行した場合は Stream ID: 1 を使用していた．なぜ Firefox の方でこのような仕様になっているかについては，4. Firefox 解析で扱うことにする．

??? note "curl -v 実行結果"

    ```text
    $ curl -v https://www.shonenjump.com/j/weeklyshonenjump/
    * Host www.shonenjump.com:443 was resolved.
    * IPv6: (none)
    * IPv4: 202.218.223.232
    *   Trying 202.218.223.232:443...
    * Connected to www.shonenjump.com (202.218.223.232) port 443
    * ALPN: curl offers h2,http/1.1
    * TLSv1.3 (OUT), TLS handshake, Client hello (1):
    *  CAfile: /etc/ssl/certs/ca-certificates.crt
    *  CApath: /etc/ssl/certs
    * TLSv1.3 (IN), TLS handshake, Server hello (2):
    * TLSv1.3 (IN), TLS handshake, Encrypted Extensions (8):
    * TLSv1.3 (IN), TLS handshake, Certificate (11):
    * TLSv1.3 (IN), TLS handshake, CERT verify (15):
    * TLSv1.3 (IN), TLS handshake, Finished (20):
    * TLSv1.3 (OUT), TLS change cipher, Change cipher spec (1):
    * TLSv1.3 (OUT), TLS handshake, Finished (20):
    * SSL connection using TLSv1.3 / TLS_AES_256_GCM_SHA384 / X25519 / RSASSA-PSS
    * ALPN: server accepted h2
    * Server certificate:
    *  subject: CN=*.shonenjump.com
    *  start date: Apr  7 14:13:18 2026 GMT
    *  expire date: Jul  6 14:13:17 2026 GMT
    *  subjectAltName: host "www.shonenjump.com" matched cert's "*.shonenjump.com"
    *  issuer: C=US; O=Let's Encrypt; CN=R13
    *  SSL certificate verify ok.
    *   Certificate level 0: Public key type RSA (4096/152 Bits/secBits), signed using sha256WithRSAEncryption
    *   Certificate level 1: Public key type RSA (2048/112 Bits/secBits), signed using sha256WithRSAEncryption
    *   Certificate level 2: Public key type RSA (4096/152 Bits/secBits), signed using sha256WithRSAEncryption
    * using HTTP/2
    * [HTTP/2] [1] OPENED stream for https://www.shonenjump.com/j/weeklyshonenjump/
    * [HTTP/2] [1] [:method: GET]
    * [HTTP/2] [1] [:scheme: https]
    * [HTTP/2] [1] [:authority: www.shonenjump.com]
    * [HTTP/2] [1] [:path: /j/weeklyshonenjump/]
    * [HTTP/2] [1] [user-agent: curl/8.5.0]
    * [HTTP/2] [1] [accept: */*]
    > GET /j/weeklyshonenjump/ HTTP/2
    > Host: www.shonenjump.com
    > User-Agent: curl/8.5.0
    > Accept: */*
    > 
    * TLSv1.3 (IN), TLS handshake, Newsession Ticket (4):
    * TLSv1.3 (IN), TLS handshake, Newsession Ticket (4):
    * old SSL session ID is stale, removing
    < HTTP/2 200 
    < date: Sun, 10 May 2026 05:40:29 GMT
    < server: Apache
    < x-frame-options: SAMEORIGIN
    < content-type: text/html
    < 
    ```

内容を見ると，2. 情報収集で見た通りの Headers が表れていることがわかる．
続いて，Stream ID: 3 についても Window size を 12MB に増やす．
```text
Stream: HEADERS, Stream ID: 3, Length 309, GET /j/weeklyshonenjump/
    Length: 309
    Type: HEADERS (1)
    Flags: 0x25, Priority, End Headers, End Stream
    0... .... .... .... .... .... .... .... = Reserved: 0x0
    .000 0000 0000 0000 0000 0000 0000 0011 = Stream Identifier: 3
    [Pad Length: 0]
    0... .... .... .... .... .... .... .... = Exclusive: False
    .000 0000 0000 0000 0000 0000 0000 0000 = Stream Dependency: 0
    Weight: 41
    [Weight real: 42]
    Header Block Fragment [truncated]: 82058f63a31e0a5eb47a44e7a8b574b69ad8418ef1e3c2e89cf516ae96d35ae43d3f877abbd07f66a281b0dae053fafc087ed4e11db526dfb5339aab7ca9e5e72271afb52cef702d81707f6a62293a9d810020004015309ac2ca7f2c05b02e0f53b0497ca589
    [Header Length: 563]
    [Header Count: 16]
    Header: :method: GET
    Header: :path: /j/weeklyshonenjump/
    Header: :authority: www.shonenjump.com
    Header: :scheme: https
    Header: user-agent: Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:150.0) Gecko/20100101 Firefox/150.0
    Header: accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8
    Header: accept-language: en-US,en;q=0.9
    Header: accept-encoding: gzip, deflate, br, zstd
    Header: sec-gpc: 1
    Header: upgrade-insecure-requests: 1
    Header: sec-fetch-dest: document
    Header: sec-fetch-mode: navigate
    Header: sec-fetch-site: none
    Header: sec-fetch-user: ?1
    Header: priority: u=0, i
    Header: te: trailers
    [Full request URI: https://www.shonenjump.com/j/weeklyshonenjump/]
    [Response in frame: 28]
```
```text
Stream: WINDOW_UPDATE, Stream ID: 3, Length 4
    Length: 4
    Type: WINDOW_UPDATE (8)
    Flags: 0x00
        0000 0000 = Unused: 0x00
    0... .... .... .... .... .... .... .... = Reserved: 0x0
    .000 0000 0000 0000 0000 0000 0000 0011 = Stream Identifier: 3
    0... .... .... .... .... .... .... .... = Reserved: 0x0
    .000 0000 1011 1110 0000 0000 0000 0000 = Window Size Increment: 12451840
    [Stream window size (before): 131072]
    [Stream window size (after): 12582912]
```

#### 3.4.3. SETTINGS[0], WINDOW_UPDATE[0]

今度は Server -> Client への通信で，Client -> Server 通信全体の設定をしている．
Server への通信は最大で 100 並列の通信が可能であること，Window size が 2GB まで増えていることを通知している．

```text
Stream: SETTINGS, Stream ID: 0, Length 6
    Length: 6
    Type: SETTINGS (4)
    Flags: 0x00
    0... .... .... .... .... .... .... .... = Reserved: 0x0
    .000 0000 0000 0000 0000 0000 0000 0000 = Stream Identifier: 0
    Settings - Max concurrent streams : 100
        Settings Identifier: Max concurrent streams (3)
        Max concurrent streams: 100
```
```text
Stream: WINDOW_UPDATE, Stream ID: 0, Length 4
    Length: 4
    Type: WINDOW_UPDATE (8)
    Flags: 0x00
    0... .... .... .... .... .... .... .... = Reserved: 0x0
    .000 0000 0000 0000 0000 0000 0000 0000 = Stream Identifier: 0
    0... .... .... .... .... .... .... .... = Reserved: 0x0
    .111 1111 1111 1111 0000 0000 0000 0000 = Window Size Increment: 2147418112
    [Connection window size (before): 65535]
    [Connection window size (after): 2147483647]
```

#### 3.4.4. HEADERS[3]: 200 OK, DATA[3], DATA[3], DATA[3], DATA[3], DATA[3], DATA[3]

先ほどの GET リクエストに対して，サーバから 200 レスポンスが返ってきている．ヘッダの内容は 2. 情報収集の通りである．
また，続いて DATA フレームが流れてきている．

```text
Stream: HEADERS, Stream ID: 3, Length 67, 200 OK
    Length: 67
    Type: HEADERS (1)
    Flags: 0x04, End Headers
    0... .... .... .... .... .... .... .... = Reserved: 0x0
    .000 0000 0000 0000 0000 0000 0000 0011 = Stream Identifier: 3
    [Pad Length: 0]
    Header Block Fragment: 3fe11f886196d07abe94034a681fa5040138a05db807ee01c53168df768586b19272ff408bf2b4b60e92ac7ad263d48f89dd0e8c1ab6e4c5934f5f87497ca589d34d1f
    [Header Length: 141]
    [Header Count: 6]
    Header table size update
    Header: :status: 200 OK
    Header: date: Mon, 04 May 2026 17:09:06 GMT
    Header: server: Apache
    Header: x-frame-options: SAMEORIGIN
    Header: content-type: text/html
    [Time since request: 0.012013256 seconds]
    [Request in frame: 18]
```

復号された生データを見ると，0x0055-0x055f が DATA となっており，title タグに囲まれた 0x00ec - 0x013f を UTF-8 で読むと「今号のジャンプ情報｜集英社『週刊少年ジャンプ』公式サイト」となる．

```text
0000   00 00 43 01 04 00 00 00 03 3f e1 1f 88 61 96 d0   ..C......?...a..
0010   7a be 94 03 4a 68 1f a5 04 01 38 a0 5d b8 07 ee   z...Jh....8.]...
0020   01 c5 31 68 df 76 85 86 b1 92 72 ff 40 8b f2 b4   ..1h.v....r.@...
0030   b6 0e 92 ac 7a d2 63 d4 8f 89 dd 0e 8c 1a b6 e4   ....z.c.........
0040   c5 93 4f 5f 87 49 7c a5 89 d3 4d 1f 00 05 0b 00   ..O_.I|...M.....
0050   00 00 00 00 03 3c 21 44 4f 43 54 59 50 45 20 68   .....<!DOCTYPE h
0060   74 6d 6c 3e 0a 3c 68 74 6d 6c 3e 0a 3c 68 65 61   tml>.<html>.<hea
0070   64 20 70 72 65 66 69 78 3d 22 6f 67 3a 20 68 74   d prefix="og: ht
0080   74 70 3a 2f 2f 6f 67 70 2e 6d 65 2f 6e 73 23 20   tp://ogp.me/ns# 
0090   66 62 3a 20 68 74 74 70 3a 2f 2f 6f 67 70 2e 6d   fb: http://ogp.m
00a0   65 2f 6e 73 2f 66 62 23 20 61 72 74 69 63 6c 65   e/ns/fb# article
00b0   3a 20 68 74 74 70 3a 2f 2f 6f 67 70 2e 6d 65 2f   : http://ogp.me/
00c0   6e 73 2f 61 72 74 69 63 6c 65 23 22 3e 0a 3c 6d   ns/article#">.<m
00d0   65 74 61 20 63 68 61 72 73 65 74 3d 22 55 54 46   eta charset="UTF
00e0   2d 38 22 3e 0a 3c 74 69 74 6c 65 3e e4 bb 8a e5   -8">.<title>....
00f0   8f b7 e3 81 ae e3 82 b8 e3 83 a3 e3 83 b3 e3 83   ................
0100   97 e6 83 85 e5 a0 b1 ef bd 9c e9 9b 86 e8 8b b1   ................
0110   e7 a4 be e3 80 8e e9 80 b1 e5 88 8a e5 b0 91 e5   ................
0120   b9 b4 e3 82 b8 e3 83 a3 e3 83 b3 e3 83 97 e3 80   ................
0130   8f e5 85 ac e5 bc 8f e3 82 b5 e3 82 a4 e3 83 88   ................
0140   3c 2f 74 69 74 6c 65 3e 0a 09 0a 3c 21 2d 2d 20   </title>...<!-- 
0150   47 6f 6f 67 6c 65 20 54 61 67 20 4d 61 6e 61 67   Google Tag Manag
0160   65 72 20 2d 2d 3e 0a 3c 73 63 72 69 70 74 3e 28   er -->.<script>(
0170   66 75 6e 63 74 69 6f 6e 28 77 2c 64 2c 73 2c 6c   function(w,d,s,l
0180   2c 69 29 7b 77 5b 6c 5d 3d 77 5b 6c 5d 7c 7c 5b   ,i){w[l]=w[l]||[
```
```text
$ xxd -r -p
e4 bb 8a e5 
8f b7 e3 81 ae e3 82 b8 e3 83 a3 e3 83 b3 e3 83
97 e6 83 85 e5 a0 b1 ef bd 9c e9 9b 86 e8 8b b1
e7 a4 be e3 80 8e e9 80 b1 e5 88 8a e5 b0 91 e5
b9 b4 e3 82 b8 e3 83 a3 e3 83 b3 e3 83 97 e3 80
8f e5 85 ac e5 bc 8f e3 82 b5 e3 82 a4 e3 83 88
今号のジャンプ情報｜集英社『週刊少年ジャンプ』公式サイト
```

#### 3.4.5. HEADERS[5]: GET /j/common/css/common.css, WINDOW_UPDATE[5] (52)

/j/weeklyshonenjump/ の HTML が取得できた後は，Stream ID: 5,7,9,.. と奇数番号を用いて並列に GET リクエストが走った．この後の GET の流れはトップページと同様である．

### 3.5. その他の観察

今回見えた TCP stream は一つだが，何度か実験をしていると，DNS 終了後に 2 つコネクションが貼られ，片方が HTTP/2 の本処理をすることなく終了する場合があった．
この場合は，以下のように HTTP/2 の始まりと同時に　GOAWAY が Client から送られ，それを受け取った Server が以下の処理を一度の Ethernet で送ってきたと思われる．

1. TLS New Session Ticket
2. HTTP/2 SETTINGS, WINDOW_UPDATE [0]
3. HTTP/2 GOAWAY [0]
4. TLS Alert (Close Notify)
5. TCP FIN/ACK

(閉じられた方のみ抜粋)
```text
10	4.441216305	192.168.64.6	202.218.223.232	TCP	74	49018 → 443 [SYN] Seq=0 Win=64240 Len=0 MSS=1460 SACK_PERM TSval=344669792 TSecr=0 WS=1024
12	4.451463037	202.218.223.232	192.168.64.6	TCP	74	443 → 49018 [SYN, ACK] Seq=0 Ack=1 Win=28960 Len=0 MSS=1420 SACK_PERM TSval=4123170639 TSecr=344669792 WS=32
14	4.451514577	192.168.64.6	202.218.223.232	TCP	66	49018 → 443 [ACK] Seq=1 Ack=1 Win=64512 Len=0 TSval=344669802 TSecr=4123170639
18	4.453535925	192.168.64.6	202.218.223.232	TCP	1474	49018 → 443 [ACK] Seq=1 Ack=1 Win=64512 Len=1408 TSval=344669804 TSecr=4123170639 [TCP segment of a reassembled PDU]
19	4.453537508	192.168.64.6	202.218.223.232	TLSv1.3	549	Client Hello (SNI=www.shonenjump.com)
22	4.463343255	202.218.223.232	192.168.64.6	TCP	66	443 → 49018 [ACK] Seq=1 Ack=1409 Win=31872 Len=0 TSval=4123170652 TSecr=344669804
23	4.463343297	202.218.223.232	192.168.64.6	TCP	66	443 → 49018 [ACK] Seq=1 Ack=1892 Win=34688 Len=0 TSval=4123170652 TSecr=344669804
26	4.470938953	202.218.223.232	192.168.64.6	TLSv1.3	3735	Server Hello, Change Cipher Spec, Encrypted Extensions, Certificate, Certificate Verify, Finished
27	4.470948869	192.168.64.6	202.218.223.232	TCP	66	49018 → 443 [ACK] Seq=1892 Ack=3670 Win=72704 Len=0 TSval=344669822 TSecr=4123170659
29	4.478567816	192.168.64.6	202.218.223.232	TLSv1.3	146	Change Cipher Spec, Finished
32	4.481757457	192.168.64.6	202.218.223.232	HTTP2	175	Magic, SETTINGS[0], WINDOW_UPDATE[0], GOAWAY[0]
38	4.490648194	202.218.223.232	192.168.64.6	TLSv1.3	369	New Session Ticket
39	4.490648319	202.218.223.232	192.168.64.6	TLSv1.3	369	New Session Ticket
40	4.490648319	202.218.223.232	192.168.64.6	HTTP2	116	SETTINGS[0], WINDOW_UPDATE[0]
41	4.490648360	202.218.223.232	192.168.64.6	HTTP2	105	GOAWAY[0]
42	4.490648360	202.218.223.232	192.168.64.6	TLSv1.3	90	Alert (Level: Warning, Description: Close Notify)
44	4.490648402	202.218.223.232	192.168.64.6	TCP	66	443 → 49018 [FIN, ACK] Seq=4389 Ack=2081 Win=34688 Len=0 TSval=4123170679 TSecr=344669832
45	4.490728774	192.168.64.6	202.218.223.232	TCP	66	49018 → 443 [ACK] Seq=2081 Ack=4390 Win=77824 Len=0 TSval=344669841 TSecr=4123170678
46	4.490750982	192.168.64.6	202.218.223.232	TLSv1.3	90	Alert (Level: Warning, Description: Close Notify)
47	4.490756023	192.168.64.6	202.218.223.232	TCP	66	49018 → 443 [FIN, ACK] Seq=2105 Ack=4390 Win=77824 Len=0 TSval=344669841 TSecr=4123170678
59	4.499796755	202.218.223.232	192.168.64.6	TCP	66	443 → 49018 [ACK] Seq=4390 Ack=2106 Win=34688 Len=0 TSval=4123170689 TSecr=344669841
```


上記のように Client 側は FIN/ACK に対して丁寧に 4-way で応答する場合もあったが，RST で切ってしまう場合もあった．
これは双方の FIN/ACK を始めるタイミングに依存しているように見える．先ほどは Server からの FIN/ACK を受信してから，穏やかに 4-way で閉じることが出来た．
しかし，以下の場合は RTT が 10ms であることを考えると，Client -> Server へ FIN/ACK を送ってから，それを Server が受け取る前に Server が FIN/ACK を送ってしまったようだ．
Server 側は一度のリクエストで HTTP/2 GOAWAY, TLS Close Notify, TCP FIN/ACK を送っている．

Client 側としては，接続終了着手後に FIN/ACK が届くので RST を送ることになる．
https://08thse.blog.fc2.com/blog-entry-344.html

```text
12	0.051752808	192.168.64.6	202.218.223.232	TCP	74	34726 → 443 [SYN] Seq=0 Win=64240 Len=0 MSS=1460 SACK_PERM TSval=2371545797 TSecr=0 WS=1024
15	0.061970844	202.218.223.232	192.168.64.6	TCP	74	443 → 34726 [SYN, ACK] Seq=0 Ack=1 Win=28960 Len=0 MSS=1420 SACK_PERM TSval=2489422164 TSecr=2371545797 WS=32
17	0.062017841	192.168.64.6	202.218.223.232	TCP	66	34726 → 443 [ACK] Seq=1 Ack=1 Win=64512 Len=0 TSval=2371545808 TSecr=2489422164
19	0.074762616	192.168.64.6	202.218.223.232	TCP	1474	34726 → 443 [ACK] Seq=1 Ack=1 Win=64512 Len=1408 TSval=2371545821 TSecr=2489422164 [TCP segment of a reassembled PDU]
20	0.074767075	192.168.64.6	202.218.223.232	TLSv1.3	549	Client Hello (SNI=www.shonenjump.com)
23	0.082943219	202.218.223.232	192.168.64.6	TCP	66	443 → 34726 [ACK] Seq=1 Ack=1409 Win=31872 Len=0 TSval=2489422187 TSecr=2371545821
24	0.082943428	202.218.223.232	192.168.64.6	TCP	66	443 → 34726 [ACK] Seq=1 Ack=1892 Win=34688 Len=0 TSval=2489422187 TSecr=2371545821
25	0.090884085	202.218.223.232	192.168.64.6	TLSv1.3	3735	Server Hello, Change Cipher Spec, Encrypted Extensions, Certificate, Certificate Verify, Finished
30	0.090928625	192.168.64.6	202.218.223.232	TCP	66	34726 → 443 [ACK] Seq=1892 Ack=3670 Win=72704 Len=0 TSval=2371545837 TSecr=2489422193
32	0.093290581	192.168.64.6	202.218.223.232	TLSv1.3	146	Change Cipher Spec, Finished
33	0.093849760	192.168.64.6	202.218.223.232	HTTP2	175	Magic, SETTINGS[0], WINDOW_UPDATE[0], GOAWAY[0]
35	0.101611969	202.218.223.232	192.168.64.6	TLSv1.3	369	New Session Ticket
36	0.101612177	202.218.223.232	192.168.64.6	TLSv1.3	369	New Session Ticket
37	0.101612177	202.218.223.232	192.168.64.6	HTTP2	116	SETTINGS[0], WINDOW_UPDATE[0]
38	0.101750878	192.168.64.6	202.218.223.232	TCP	66	34726 → 443 [ACK] Seq=2081 Ack=4326 Win=77824 Len=0 TSval=2371545848 TSecr=2489422205
39	0.101782501	192.168.64.6	202.218.223.232	TLSv1.3	90	Alert (Level: Warning, Description: Close Notify)
40	0.101790209	192.168.64.6	202.218.223.232	TCP	66	34726 → 443 [FIN, ACK] Seq=2105 Ack=4326 Win=77824 Len=0 TSval=2371545848 TSecr=2489422205
41	0.103769811	202.218.223.232	192.168.64.6	HTTP2	105	GOAWAY[0]
42	0.103769894	202.218.223.232	192.168.64.6	TLSv1.3	90	Alert (Level: Warning, Description: Close Notify)
44	0.103769978	202.218.223.232	192.168.64.6	TCP	66	443 → 34726 [FIN, ACK] Seq=4389 Ack=2081 Win=34688 Len=0 TSval=2489422206 TSecr=2371545840
45	0.103808892	192.168.64.6	202.218.223.232	TCP	54	34726 → 443 [RST] Seq=2081 Win=0 Len=0
49	0.112732289	202.218.223.232	192.168.64.6	TCP	66	443 → 34726 [ACK] Seq=4390 Ack=2106 Win=34688 Len=0 TSval=2489422215 TSecr=2371545848
50	0.112777828	192.168.64.6	202.218.223.232	TCP	54	34726 → 443 [RST] Seq=2106 Win=0 Len=0
```

さらに何度か実験すると，TLS handshake も行わずに Connection を閉じる場合もあった．
```text
20	1.343806561	192.168.64.6	202.218.223.232	TCP	74	59856 → 443 [SYN] Seq=0 Win=64240 Len=0 MSS=1460 SACK_PERM TSval=3687882823 TSecr=0 WS=1024
25	1.353371278	202.218.223.232	192.168.64.6	TCP	74	443 → 59856 [SYN, ACK] Seq=0 Ack=1 Win=28960 Len=0 MSS=1240 SACK_PERM TSval=2388508205 TSecr=3687882823 WS=32
26	1.353405982	192.168.64.6	202.218.223.232	TCP	66	59856 → 443 [ACK] Seq=1 Ack=1 Win=64512 Len=0 TSval=3687882833 TSecr=2388508205
28	1.358368753	192.168.64.6	202.218.223.232	TCP	66	59856 → 443 [FIN, ACK] Seq=1 Ack=1 Win=64512 Len=0 TSval=3687882838 TSecr=2388508205
36	1.365858424	202.218.223.232	192.168.64.6	TCP	66	443 → 59856 [ACK] Seq=1 Ack=2 Win=28960 Len=0 TSval=2388508219 TSecr=3687882838
37	1.365858591	202.218.223.232	192.168.64.6	TCP	66	443 → 59856 [FIN, ACK] Seq=1 Ack=2 Win=28960 Len=0 TSval=2388508219 TSecr=3687882838
77	1.591449554	202.218.223.232	192.168.64.6	TCP	66	[TCP Retransmission] 443 → 59856 [FIN, ACK] Seq=1 Ack=2 Win=28960 Len=0 TSval=2388508446 TSecr=3687882838
78	1.591472593	192.168.64.6	202.218.223.232	TCP	66	59856 → 443 [ACK] Seq=2 Ack=2 Win=64512 Len=0 TSval=3687883071 TSecr=2388508446
```

そもそも，なぜわざわざ 2 本立てたのだろうか．
古い記事になるが，接続にストリーム多重化がサポートされている HTTP/2 が使えると分かる前に，HTTP1 でも高速に接続できるように用意しておくためという解説がなされている．
内部実装については 4. Firefox 解析で追うとして，一応は理にかなっているように思われる．

> Before the browser knows that the server speaks HTTP/2, it may fire up 6 connection attempts so that it is prepared to get the remote site at full speed. Once it figures out that it doesn’t need all those connections, it will kill off the unnecessary unused ones and over time trickle down to one. Of course, on subsequent connections to the same origin the client may have the version information cached so that it doesn’t have to start off presuming HTTP/1.

https://daniel.haxx.se/blog/2016/08/18/http2-connection-coalescing/


(まとめ)
本章では，Wireshark を用いて，対象 URL を開いた直後の通信をパケットレベルで確認した．今回の観測では，まず HTTPS/A/AAAA の DNS query が送られ，A record として 202.218.223.232 が得られた．その後，202.218.223.232:443 に対して TCP 3-way handshake が行われ，TLSv1.3 handshake によって暗号化通信路が確立された．ALPN では Server が h2 を選択したため，TLS handshake 後の application data は HTTP/2 frame として解釈できた．

HTTP/2 では，client connection preface，SETTINGS，WINDOW_UPDATE の後，Stream ID 3 で /j/weeklyshonenjump/ への GET request が送られた．Server から 200 OK と DATA frame が返った後，CSS や JavaScript などの追加リソースが別の奇数 Stream ID で並列に取得された．

以降の章では，この packet capture で観測された各段階が，Firefox 内部，Linux TCP 実装，ネットワーク経路のそれぞれでどのように実現されているかを追う．


## 4. Firefox 解析
ここまでのパケット解析で，ネットワーク上に出た後の DNS・TCP・TLS・HTTP/2 の流れはある程度分かった．
しかし，例えば最初の Enter key を押してから最初の DNS query が出るまでに Firefox 内部で何が起きているのかは packet capture だけでは分からない．

本章では，これまでのパケット解析で観測した挙動の裏側を，Firefox Profiler と Searchfox を用いてコードレベルで追う．
ただし，Profiler はサンプリングベースであるため，短時間で実行される関数は Stack Chart に現れないことがある．そのため，本章では Profiler で得られた stack，Searchfox で確認したコード，およびパケット解析結果との時刻対応を組み合わせて流れを復元する．

特に断らない限り，文中に示す stack は Firefox Profiler の Stack Chart から得たものである．Searchfox から補った推測を含む場合は，その旨を明示する．

Firefox Profiler は Profile 結果を共有できるので，解析に使ったものを以下のリンクから共有する．(注: 個人情報を含むため削除)

コードを参照したものについては，適宜 Searchfox のリンクを置いている．前半はリンクが多いが，後半は Stack からコードをトレースする時間の余裕がなくなってしまったため少なくなっている．

この章では，問題の趣旨に鑑みネットワークに関連する部分に焦点を置いて記述する．
具体的な内容としては，概ね 3. パケット解析と同様に，DNS〜TLS handshake〜HTTP/2 GET の流れを追うこととする．

流れの要約は以下の通り．

**4.1. Enter key 〜 Load 分岐**

Enter key を押してから，Main Thread で Load 準備を進めて Speculative Connect 及び本体 Channel Load に進むまでを追う．

```text
Enter Key Event
 -> URL 補正
  -> Speculative Connect 要求 (-> 4.2. へ)
  -> 本体 Channel Load 要求 (-> 4.3. へ)
```

**4.2. Speculative Connect**
Main Thread から Socket Thread に処理を移した後，DNS, TLS Handshake, HTTP/2 Connection Preface までを追う．

```text
Speculative Connect Event
  -> Main Thread 処理
    -> Socket Thread へ
        -> DNS
        -> TCP Connect
        -> TLS Handshake
        -> HTTP/2 Connection Preface
```

**4.3. 本体 Channel Load**
HttpChannel 作成後，再度 Speculative Connect を行い，HTTP/2 GET 送信/受信，そしてレンダリングまでを追う．

(送信)
```text
(Main Thread)
Create HTTP Channel
-> Dispatch Speculative Connect (-> Socket Thread へ)
-> Dispatch Transaction (-> Socket Thread へ)
```

(受信)
```text
(Parent Process)
Socket Thread からパイプ読み込み
-> Content Process Browser 開始指示
-> Content Process Document 作成指示
  -> (Content Process) Parse 指示
    -> (HTML5 Parser Thread) Parse
  -> CSS,JS,IMG Load, JS Execute
  -> DOM Content Loaded
```


また，3. パケット解析で得た疑問点のうち，本章に解析を委ねた事項について詳細を調べる．内容は以下の通り．

1. DNS HTTPS/A/AAAA レコード発出の順序: 4.2.節の DNS 
2. HTTP/2 で Stream ID: 1 を使用しない理由
3. 複数 TCP connection を立てて，片方をすぐに閉じた理由


以下本文に進む．


### 4.1. Enter key 〜 Load 分岐
Urlbar で Enter キーが押されたことを認識後，speculativeConnect と本体 Channel Load に分かれるまでを追う．以下，全て Parent Process / Main Thread である． 


```text
handleEvent
-> _on_keydown
  -> maybeDeferEvent
    -> handleKeyNavigation
      -> handleCommand
        -> handleNavigation
          -> pickElement
            -> pickResult
              -> setValueFromResult
              -> _loadURL
                -> openTrustedLinkIn
                  -> openLinkIn
                    -> openInCurrentTab
                      -> fixupAndLoadURIString
                        -> _internalMaybeFixupLoadURI
                          -> RemoteWebNavigation.fixupAndLoadURIString
```

(handleEvent 〜 handleCommand)

> Passes DOM events to the `_on_<event type>` methods.

まず handleEvent で keydown event (_on_keydown) の呼び出しを行う．

次に，_on_keydown から maybeDeferEvent を介して handleKeyNavigation に callback し，case VK_RETURN (Enter) から handleCommand を呼び出す．
URL Bar の左側に出ている This time search with ... の one-off がなければ，そのまま handleNavigation に進む．

??? note "ソースコードリンク"

    - handleEvent: https://searchfox.org/firefox-main/source/browser/components/urlbar/content/UrlbarInput.mjs#1077
    - _on_keydown: https://searchfox.org/firefox-main/source/browser/components/urlbar/content/UrlbarInput.mjs#5769
    - handleKeyNavigation case VK_RETURN: https://searchfox.org/firefox-main/source/browser/components/urlbar/UrlbarController.sys.mjs#377
    - handleCommand: https://searchfox.org/firefox-main/source/browser/components/urlbar/content/UrlbarInput.mjs#1096


(handleNavigation 〜 openInCurrentTab)

handleNavigation で選択後に入力が変わっていないことなどをチェック後，pickElement, pickResult へと進む．
pickResult では setValueFromResult で Urlbar 表示内容を設定後，_loadURL, openTrustedLinkIn, openLinkIn, openInCurrentTab に進む．
openInCurrentTab で fixupAndLoadURIString を呼び出し，Urlbar から tabbrowser に処理が移る．

??? note "ソースコードリンク"

    - handleNavigation: https://searchfox.org/firefox-main/source/browser/components/urlbar/content/UrlbarInput.mjs#1153
    - pickResult: https://searchfox.org/firefox-main/source/browser/components/urlbar/content/UrlbarInput.mjs#1478
    - openInCurrentTab: https://searchfox.org/firefox-main/source/browser/modules/URILoadingHelper.sys.mjs#232


(fixupAndLoadURIString)

tabbrowser の fixupAndLoadURIString は URI を _fixupURIString で補正し，browser.webNavigation.fixupAndLoadURIString を呼び出す．
ここでは実体が RemoteWebNavigation になっており，ここで _speculativeConnect 及び browsingContext.fixupAndLoadURIString の呼び出しを行う．

- fixupAndLoadURIString: https://searchfox.org/firefox-main/source/browser/components/tabbrowser/content/tabbrowser.js#9952
- RemoteWebNavigation.fixupAndLoadURIString: https://searchfox.org/firefox-main/source/toolkit/components/remotebrowserutils/RemoteWebNavigation.sys.mjs#140


### 4.2. Speculative Connect

RemoteWebNavigation から _speculativeConnect を呼び出されてから，DNS, TLS Handshake を経て HTTP/2 Connection Preface を送るまでを追う．

これにより本体 Channel Load 側で使う用の connection を事前に温めておくことが出来る．

#### 4.2.1. Main Thread
ここでは Proxy の処理をしてから HTTP Handler の SpeculativeConnect を呼び出し，Socket Thread に Speculative Connect Event を投げるまでを追う．

```text
RemoteWebNavigation.fixupAndLoadURIString
  -> _speculativeConnect
    -> nsIOService::SpeculativeConnect
      -> nsIOService::SpeculativeConnectInternal
        -> nsProtocolProxyService::AsyncResolve2 (AsyncResolve かもしれない)
          -> nsProtocolProxyService::AsyncResolveInternal
            -> nsAsyncResolveRequest::ProcessLocally
              -> nsAsyncResolveRequest::AsyncApplyFilters::AsyncProcess
                -> nsAsyncResolveRequest::AsyncApplyFilters::ProcessNextFilter
                  -> nsAsyncResolveRequest::AsyncApplyFilters::Finish
              -> (callback) nsAsyncResolveRequest::Run
                -> nsAsyncResolveRequest::DoCallback
                  -> nsProtocolProxyService::CallOnProxyAvailableCallback
                    -> IOServiceProxyCallback::OnProxyAvailable
                      -> nsHttpsHandler::SpeculativeConnect
                        -> nsHttpHandler::SpeculativeConnect
                          -> nsHttpHandler::SpeculativeConnectInternal
                            -> nsHttpHandler::MaybeSpeculativeConnectWithHTTPSRR (ここからはコードからの推測)
                              -> nsHttpConnectionMgr::SpeculativeConnect
                                -> PostEvent(&nsHttpConnectionMgr::OnMsgSpeculativeConnect, 0, args)
```

まず _speculativeConnect が nsIOService::SpeculativeConnect を呼び出す．
nsIOService::SpeculativeConnectInternal で IOServiceProxyCallback::OnProxyAvailable を callback に，proxy を使うかどうか処理を行う．
今回は本筋ではないので飛ばすとして，処理が終わると OnProxyAvailable が呼ばれる．

OnProxyAvailable では `nsCOMPtr<nsISpeculativeConnect> speculativeHandler = do_QueryInterface(handler);` により nsHttpsHandler が選ばれ，speculativeHandler->SpeculativeConnect で nsHttpsHandler::SpeculativeConnect が呼ばれる．

nsHttpsHandler::SpeculativeConnect からは gHttpHandler->SpeculativeConnect (実体は nsHttpHandler::SpeculativeConnect), SpeculativeConnectInternal, MaybeSpeculativeConnectWithHTTPSRR, nsHttpConnectionMgr::SpeculativeConnect が呼ばれる．
nsHttpConnectionMgr::SpeculativeConnect は以下のように return しており，これで Event が Socket Thread に引き継がれる．

`return PostEvent(&nsHttpConnectionMgr::OnMsgSpeculativeConnect, 0, args);`

PostEvent では以下のように Socket Thread が target になっており，target に handler が dispatch されている．
```text
  nsCOMPtr<nsIEventTarget> target;
  {
    auto lock = mSocketThreadTarget.Lock();
    target = *lock;
  }
```

??? note "ソースコードリンク"

    - _speculativeConnect: https://searchfox.org/firefox-main/source/toolkit/components/remotebrowserutils/RemoteWebNavigation.sys.mjs#91
    - nsIOService::SpeculativeConnectInternal https://searchfox.org/firefox-main/source/netwerk/base/nsIOService.cpp#2191
    - nsProtocolProxyService::AsyncResolveInternal: https://searchfox.org/firefox-main/source/netwerk/base/nsProtocolProxyService.cpp#1558
    - IOServiceProxyCallback::OnProxyAvailable: https://searchfox.org/firefox-main/source/netwerk/base/nsIOService.cpp#2145
    - nsHttpsHandler::SpeculativeConnect: https://searchfox.org/firefox-main/source/netwerk/protocol/http/nsHttpHandler.h#878
    - nsHttpHandler::SpeculativeConnect: https://searchfox.org/firefox-main/source/netwerk/protocol/http/nsHttpHandler.cpp#2587
    - nsHttpConnectionMgr::SpeculativeConnect: https://searchfox.org/firefox-main/source/netwerk/protocol/http/nsHttpConnectionMgr.cpp#515


#### 4.2.2. Socket Thread

(目次)

1. DNS
2. TLS Handshake <br>
  2.1. Build Socket <br>
  2.2. Client Hello <br>
  2.3. Server Hello, Encrypted Extensions, Certificate, CertificateVerify, Server Finished <br>
  2.4. Client Finished <br>
3. HTTP/2 Connection Preface

##### 4.2.2.1. DNS

ここでは，HTTPS RR lookup 後，callback 経由で A/AAAA lookup を実行し，DNS の処理が完了した Event を投げるまでを追う．
また，途中で DNS Thread に処理が移るので，そちらの内容も追う．

以下は何度か Profiler を実行して得られた Stack Chart を前半と後半で繋げたもの．

```text
nsHttpConnectionMgr::OnMsgSpeculativeConnect
  -> nsHttpConnectionMgr::DoSpeculativeConnection
    -> nsHttpConnectionMgr::DoSpeculativeConnectionInternal
      -> SpeculativeTransaction::FetchHTTPSRR
        -> nsDNSService::AsyncResolveNative
          -> nsDNSService::AsyncResolveInternal
            -> nsHostResolver::ResolveHost
              -> nsHostResolver::NameLookup
                -> nsHostResolver::NativeLookup
              -> (callback) nsDNSAsyncRequest::OnResolveHostComplete
                -> HTTPSRecordResolver::OnLookupComplete
                  -> HTTPSRecordResolver::InvokeCallback

                    -> SpeculativeTransaction::OnHTTPSRRAvailable
                      -> nsHttpConnectionMgr::DoSpeculativeConnectionInternal 
                        -> ConnectionEntry::CreateDnsAndConnectSocket
                          -> ConnectionAttemptPool::StartConnectionEstablishment 
                            -> DnsAndConnectSocket::SetupEvent 
                              -> DnsAndConnectSocket::TransportSetup::Init 
                                -> DnsAndConnectSocket::TransportSetup::ResolveHost 
                                  -> nsDNSService::AsyncResolveInternal 
                                    -> nsHostResolver::ResolveHost
                                      -> nsHostResolver::NameLookup 
                                        -> nsHostResolver::NativeLookup 
                                      -> (callback)nsDNSAsyncRequest::OnResolveHostComplete
                                        -> nsSocketTransport::OnLookupComplete
                                          -> nsSocketTransport::PostEvent(MSG_DNS_LOOKUP_COMPLETE)
```

DNS を二度実行しているように見えるが，初回は HTTPS レコード，二回目は A/AAAA レコードを引いて接続の準備をしていると考えられる．

AsyncResolveInternal, ResolveHost, NameLookup, NativeLookup と呼び出された後は，NativeLookup から nsHostResolver::MaybeDispatchResolveHostTask が呼ばれ，nsHostResolver::ResolveHostTask が DNS thread に dispatch される．

ResolveHostTask は HTTPS なら ResolveHTTPSRecord が，A/AAAA なら GetAddrInfo -> _GetAddrInfo_Portable -> PR_GetAddrInfoByName -> GETADDRINFO が呼び出される．
- GETADDRINFO は次のように定義されている． (https://searchfox.org/firefox-main/source/nsprpub/pr/src/misc/prnetdb.c#1903) 

```text
#    define GETADDRINFO_SYMBOL "getaddrinfo" // 1842 行目
_pr_getaddrinfo =
      (FN_GETADDRINFO)PR_FindFunctionSymbolAndLibrary(GETADDRINFO_SYMBOL, &lib); // 1886 行目
#    define GETADDRINFO (*_pr_getaddrinfo) // 1903 行目
```

getaddrinfo を呼び出すのに随分回りくどい方法に思われたが，プラットフォームに依存しない実装にするための NSPR という仕組みのようだ．
https://firefox-source-docs.mozilla.org/nspr/reference/introduction_to_nspr.html

なお，getaddrinfo で IPv4, IPv6 双方のアドレスを取得するため A/AAAA レコードの順番は Firefox の実装ではないので，おそらく systemd-resolved の仕様によるものと推測できる．
https://linuxjm.sourceforge.io/html/LDP_man-pages/man3/getaddrinfo.3.html

Socket Thread に話を戻すと，NativeLookup が終わると ResolveHost の callback->OnResolveHostComplete により OnLookupComplete が呼び出される．
初回では HTTPSRecordResolver::InvokeCallback が，二回目では nsSocketTransport::PostEvent(MSG_DNS_LOOKUP_COMPLETE) が実行される．
これにより，実際の接続へと処理が移っていく．

??? note "ソースコードリンク"

    - OnMsgSpeculativeConnect: https://searchfox.org/firefox-main/source/netwerk/protocol/http/nsHttpConnectionMgr.cpp#3744
    - DoSpeculativeConnection: https://searchfox.org/firefox-main/source/netwerk/protocol/http/nsHttpConnectionMgr.cpp#3646
    - DoSpeculativeConnectionInternal: https://searchfox.org/firefox-main/source/netwerk/protocol/http/nsHttpConnectionMgr.cpp#3666
    - SpeculativeTransaction::FetchHTTPSRR: https://searchfox.org/firefox-main/source/netwerk/protocol/http/SpeculativeTransaction.cpp#36
    - HTTPSRecordResolver::FetchHTTPSRRInternal: https://searchfox.org/firefox-main/source/netwerk/protocol/http/HTTPSRecordResolver.cpp#29
    - nsDNSService::AsyncResolveInternal: https://searchfox.org/firefox-main/source/netwerk/dns/nsDNSService2.cpp#1013
    - nsHostResolver::ResolveHost https://searchfox.org/firefox-main/source/netwerk/dns/nsHostResolver.cpp#444
    - nsHostResolver::NameLookup https://searchfox.org/firefox-main/source/netwerk/dns/nsHostResolver.cpp#1142
    - nsHostResolver::NativeLookup https://searchfox.org/firefox-main/source/netwerk/dns/nsHostResolver.cpp#1019
    - nsDNSAsyncRequest::OnResolveHostComplete: https://searchfox.org/firefox-main/source/netwerk/dns/nsDNSService2.cpp#513
    - HTTPSRecordResolver::OnLookupComplete: https://searchfox.org/firefox-main/source/netwerk/protocol/http/HTTPSRecordResolver.cpp#80
    - DnsAndConnectSocket::TransportSetup::ResolveHost: https://searchfox.org/firefox-main/source/netwerk/protocol/http/DnsAndConnectSocket.cpp#1372
    - nsSocketTransport::OnLookupComplete: https://searchfox.org/firefox-main/source/netwerk/base/nsSocketTransport2.cpp#2828
    - nsHostResolver::MaybeDispatchResolveHostTask: https://searchfox.org/firefox-main/source/netwerk/dns/nsHostResolver.cpp#879
    - nsHostResolver::ResolveHostTask: https://searchfox.org/firefox-main/source/netwerk/dns/nsHostResolver.cpp#1770
    - net::GetAddrInfo: https://searchfox.org/firefox-main/source/netwerk/dns/GetAddrInfo.cpp#376
    - PR_GetAddrInfoByName https://searchfox.org/firefox-main/source/nsprpub/pr/src/misc/prnetdb.c#1945


##### 4.2.2.2. TLS Handshake

###### 4.2.2.2.1. Build Socket

```text
nsSocketTransport::OnSocketEvent 
  -> MSG_DNS_LOOKUP_COMPLETE case 
    -> nsSocketTransport::InitiateSocket 
      -> nsSocketTransport::BuildSocket 
        -> PR_OpenTCPSocket
        -> nsSSLSocketProvider::NewSocket 
          -> nsSSLIOLayerNewSocket 
            -> nsSSLIOLayerAddToSocket 
              -> nsSSLIOLayerImportFD 
                -> ssl_ImportFD
                  -> ssl_NewSocket
```

先ほどの MSG_DNS_LOOKUP_COMPLETE を受けて，OnSocketEvent が発火する．MSG_DNS_LOOKUP_COMPLETE case から，
nsSocketTransport::InitiateSocket, BuildSocket が呼ばれ，PR_OpenTCPSocket から socket が生成される．
その後，NSS を用いて Socket に TLS Layer を被せる．

??? note "ソースコードリンク"

    - nsSocketTransport::OnSocketEvent MSG_DNS_LOOKUP_COMPLETE case https://searchfox.org/firefox-main/source/netwerk/base/nsSocketTransport2.cpp#2080
    - nsSocketTransport::BuildSocket: https://searchfox.org/firefox-main/source/netwerk/base/nsSocketTransport2.cpp#1085
    - nsSSLSocketProvider::NewSocket: https://searchfox.org/firefox-main/source/security/manager/ssl/nsSSLSocketProvider.cpp#20
    - nsSSLIOLayerNewSocket: https://searchfox.org/firefox-main/source/security/manager/ssl/nsNSSIOLayer.cpp#1232
    - ssl_ImportFD: https://searchfox.org/firefox-main/source/security/nss/lib/ssl/sslsock.c#2315


###### 4.2.2.2.2. Client Hello

```text
nsSocketTransport::OnSocketReady
  -> nsSocketOutputStream::OnSocketReady
    -> nsHttpConnection::OnOutputStreamReady
      -> nsHttpConnection::OnSocketWritable
        -> TlsHandshaker::EnsureNPNComplete
          -> NSSSocketControl::DriveHandshake
            -> SSL_ForceHandshake
              -> ssl_Do1stHandshake
                -> ssl_BeginClientHandshake
                  -> ssl3_SendClientHello
                    -> tls13_SetupClientHello
                      -> tls13_AddKeyShare
                        -> tls13_CreateKeyShare
                    -> ssl_ConstructExtensions (コードから補完)
```

Polling により書き込めるようになったタイミングで Client Hello を始める．
Client Hello, Server Hello など共通で SSL_ForceHandshake から始まるが，ss->version は 0 で初期化されているため，
if (ss->version >= SSL_LIBRARY_VERSION_3_0) 分岐で ssl_Do1stHandshake に飛ぶ．
また，ssl_NewSocket 時に ss->handshake が ssl_BeginClientHandshake になるように設定されるため (https://searchfox.org/firefox-main/source/security/nss/lib/ssl/sslsecur.c#694) ssl_BeginClientHandshake が呼び出される．

handshake や version の値が更新された後，ssl3_SendClientHello が呼び出される．ssl3_SendClientHello では tls13_SetupClientHello から Key Share が作成された後，ssl_ConstructExtensions から各種 Client Hello の extension が実行される．この中には ALPN (ssl_app_layer_protocol_xtn) や key_share (ssl_tls13_key_share_xtn) が含まれる．

ssl3_SendClientHello では最後に ss->ssl3.hs.ws = wait_server_hello; を実行し，Server Hello に進む．
```text
ss->handshake = ssl_GatherRecord1stHandshake;
/* ssl3_SendClientHello will override this if it succeeds. */
ss->version = SSL_LIBRARY_VERSION_3_0;
```
```text
static const sslExtensionBuilder clientHelloSendersTLS[] = {
    /* TLS 1.3 GREASE extensions - empty. */
    { ssl_tls13_grease_xtn, &tls13_SendEmptyGreaseXtn },
    { ssl_server_name_xtn, &ssl3_ClientSendServerNameXtn },
    { ssl_extended_master_secret_xtn, &ssl3_SendExtendedMasterSecretXtn },
    { ssl_renegotiation_info_xtn, &ssl3_SendRenegotiationInfoXtn },
    { ssl_supported_groups_xtn, &ssl_SendSupportedGroupsXtn },
    { ssl_ec_point_formats_xtn, &ssl3_SendSupportedPointFormatsXtn },
    { ssl_session_ticket_xtn, &ssl3_ClientSendSessionTicketXtn },
    { ssl_app_layer_protocol_xtn, &ssl3_ClientSendAppProtoXtn },
    { ssl_use_srtp_xtn, &ssl3_ClientSendUseSRTPXtn },
    { ssl_cert_status_xtn, &ssl3_ClientSendStatusRequestXtn },
    { ssl_delegated_credentials_xtn, &tls13_ClientSendDelegatedCredentialsXtn },
    { ssl_signed_cert_timestamp_xtn, &ssl3_ClientSendSignedCertTimestampXtn },
    { ssl_tls13_key_share_xtn, &tls13_ClientSendKeyShareXtn },
...
```

??? note "ソースコードリンク"

    - SSL_ForceHandshake: https://searchfox.org/firefox-main/source/security/nss/lib/ssl/sslsecur.c#385
    - ssl_BeginClientHandshake: https://searchfox.org/firefox-main/source/security/nss/lib/ssl/sslcon.c#113
    - ssl3_SendClientHello: https://searchfox.org/firefox-main/source/security/nss/lib/ssl/ssl3con.c#5509


###### 4.2.2.2.3. Server Hello, Encrypted Extensions, Certificate, CertificateVerify, Server Finished

(Server Hello)

```text
nsSocketTransport::OnSocketReady 
  -> nsSocketOutputStream::OnSocketReady 
    -> nsHttpConnection::OnOutputStreamReady 
      -> nsHttpConnection::OnSocketWritable 
        -> TlsHandshaker::EnsureNPNComplete 
          -> NSSSocketControl::DriveHandshake 
            -> SSL_ForceHandshake 
              -> ssl3_GatherCompleteHandshake 
                -> ssl3_HandleRecord 
                  -> ssl3_HandleNonApplicationData 
                    -> ssl3_HandleHandshake 
                      -> ssl3_HandleHandshakeMessage 
                        -> ssl3_HandleServerHello
                            -> tls13_HandleServerHelloPart2
                              -> tls13_HandleServerKeyShare 
```

以後，Stack において ssl3_HandleHandshakeMessage までの流れを省略する．

ssl3_GatherCompleteHandshake が受信済み handshake record を取り出し，ssl3_HandleServerHello が ServerHello を処理する．さらに tls13_HandleServerHelloPart2, tls13_HandleServerKeyShare で key_share を反映し，TLS 1.3 としての接続条件を確定する．
次に，tls13_HandleServerHelloPart2　の最後で TLS13_SET_HS_STATE(ss, wait_encrypted_extensions); が実行され Encrypted Extensions に進む．

(Encrypted Extensions)

```text
ssl3_HandleHandshakeMessage 
    -> tls13_HandlePostHelloHandshakeMessage
        -> tls13_HandleEncryptedExtensions
```

ssl3_HandleHandshakeMessage 呼び出しから tls13_HandlePostHelloHandshakeMessage, tls13_HandleEncryptedExtensions と Encrypted Extensions の処理に進む．
tls13_HandleEncryptedExtensions の最後で  TLS13_SET_HS_STATE(ss, wait_cert_request); が実行されるが，Certificate Request はないため Certificate に進む．

(Certificate)
```text
ssl3_HandleHandshakeMessage 
  -> tls13_HandleCertificate 
    -> CERT_NewTempCertificate
  -> ssl3_AuthCertificate
```

tls13_EnsureCerticateExpected で wait_cert_request も許容されているため，Certificate Request を飛ばして Certificate が処理される．
tls13_HandleCertificate では最後に ssl3_AuthCertificate を呼び出しており，TLS13_SET_HS_STATE(ss, wait_cert_verify); を実行して CertificateVerify に進む．

(CertificateVerify)
```text
ssl3_HandleHandshakeMessage 
  -> tls13_HandleCertificateVerify
    -> tls13_SignOrVerifyHashWithContext
      -> VFY_EndWithSignature
```

CertificateVerify の署名検証によって，受け取った証明書列に対応する秘密鍵をサーバが実際に保持していることを確認している．
tls13_HandleCertificateVerify では最後に TLS13_SET_HS_STATE(ss, wait_finished); を実行して Server Finished に進む．

(Server Finished)
```text
ssl3_HandleHandshakeMessage
  -> tls13_HandlePostHelloHandshakeMessage
    -> tls13_ClientHandleFinished
      -> tls13_CommonHandleFinished
        -> tls13_ComputeHandshakeHashes
        -> tls13_VerifyFinished
          -> tls13_ComputeFinished
```

tls13_ClientHandleFinished は最後に return tls13_SendClientSecondRound; を呼び，Client Finished に移る．

??? note "ソースコードリンク"

    - ssl3_HandleHandshakeMessage: https://searchfox.org/firefox-main/source/security/nss/lib/ssl/ssl3con.c#12860
    - ssl3_HandleServerHello: https://searchfox.org/firefox-main/source/security/nss/lib/ssl/ssl3con.c#7230
    - tls13_HandleServerHelloPart2: https://searchfox.org/firefox-main/source/security/nss/lib/ssl/tls13con.c#3576
    - tls13_HandlePostHelloHandshakeMessage: https://searchfox.org/firefox-main/source/security/nss/lib/ssl/tls13con.c#1436
    - tls13_HandleEncryptedExtensions: https://searchfox.org/firefox-main/source/security/nss/lib/ssl/tls13con.c#5198
    - tls13_HandleCertificate: https://searchfox.org/firefox-main/source/security/nss/lib/ssl/tls13con.c#4308
    - tls13_ClientHandleFinished: https://searchfox.org/firefox-main/source/security/nss/lib/ssl/tls13con.c#5877


###### 4.2.2.2.4. Client Finished

tls13_SendClientSecondRound が Server Finished から呼び出されるが，
再度別経路から tls13_SendClientSecondRound が呼び出されており，証明書検証が終わってから非同期に処理が再開される場合もあったことが以下のコードと Stack Chart から読み取れる．

```text
if (ss->ssl3.hs.authCertificatePending || ss->ssl3.hs.clientCertificatePending) {
        SSL_TRC(3, ("%d: TLS13[%d]: deferring tls13_SendClientSecondRound because"
                    " certificate authentication is still pending.",
                    SSL_GETPID(), ss->fd));
        ss->ssl3.hs.restartTarget = tls13_SendClientSecondRound;
        PORT_SetError(PR_WOULD_BLOCK_ERROR);
        return SECFailure;
    }
```

```text
SSLServerCertVerificationResult::Run 
  -> NSSSocketControl::SetCertVerificationResult 
    -> SSL_AuthCertificateComplete 
      -> ssl3_AuthCertificateComplete 
        -> tls13_SendClientSecondRound 
          -> tls13_ComputeApplicationSecrets 
            -> tls13_SetCipherSpec 
              -> tls13_DeriveTrafficKeys
          -> tls13_FinishHandshake
            -> ssl_FinishHandshake
              -> HandshakeCallback 
                -> PreliminaryHandshakeDone
                  -> SetPreliminaryHandshakeDone
                -> NSSSocketControl::SetHandshakeCompleted (ここからはコードからの推測)
                  -> TlsHandshaker::HandshakeDone
                    -> nsHttpConnection::HandshakeDoneInternal
                      -> nsHttpConnection::StartSpdy
```

ssl3_AuthCertificateComplete で，以下のように tls13_SendClientSecondRound を restartTarget に設定したので再開させる．

```text
else if (ss->ssl3.hs.restartTarget != NULL) {
    sslRestartTarget target = ss->ssl3.hs.restartTarget;
    ss->ssl3.hs.restartTarget = NULL;

    if (target == ssl3_FinishHandshake) {
        SSL_TRC(3, ("%d: SSL3[%p]: certificate authentication lost the race"
                    " with peer's finished message",
                    SSL_GETPID(), ss->fd));
    }

    rv = target(ss);
}
```

NSSSocketControl::SetHandshakeCompleted で callback->HandshakeDone(); が呼び出されているが，callback の型である nsITlsHandshakeCallbackListener の実体が TlsHandshaker となっており，TlsHandshaker::HandshakeDone, nsHttpConnection::HandshakeDoneInternal, nsHttpConnection::StartSpdy が呼び出され，HTTP/2 へと

??? note "ソースコードリンク"

    - ssl3_AuthCertificateComplete: https://searchfox.org/firefox-main/source/security/nss/lib/ssl/ssl3con.c#12080
    - tls13_FinishHandshake: https://searchfox.org/firefox-main/source/security/nss/lib/ssl/tls13con.c#6004
    - ssl_FinishHandshake:  https://searchfox.org/firefox-main/source/security/nss/lib/ssl/sslsecur.c#54
    - PreliminaryHandshakeDone: https://searchfox.org/firefox-main/source/security/manager/ssl/nsNSSCallbacks.cpp#884
    - HandshakeCallback: https://searchfox.org/firefox-main/source/security/manager/ssl/nsNSSCallbacks.cpp#1125
    - NSSSocketControl::SetHandshakeCompleted : https://searchfox.org/firefox-main/source/security/manager/ssl/NSSSocketControl.cpp#171
    - TlsHandshaker::HandshakeDone: https://searchfox.org/firefox-main/source/netwerk/protocol/http/TlsHandshaker.cpp#51
    - nsHttpConnection::HandshakeDoneInternal: https://searchfox.org/firefox-main/source/netwerk/protocol/http/nsHttpConnection.cpp#2524
    - nsHttpConnection::StartSpdy https://searchfox.org/firefox-main/source/netwerk/protocol/http/nsHttpConnection.cpp#307


##### 4.2.2.3. HTTP/2 Connection Preface

```text
nsHttpConnection::StartSpdy
  -> ASpdySession::NewSpdySession 
    -> Http2Session::CreateSession 
      -> Http2Session::SendHello
```

StartSpdy から新しい Session が作成され，SendHello で 3. パケット解析で見た通りに Magic, SETTINGS[0], WINDOW_UPDATE[0] が送られることがわかる．

```text
// The Hello is comprised of
// 1] 24 octets of magic, which are designed to
// flush out silent but broken intermediaries
// 2] a settings frame which sets a small flow control window for pushes
// 3] a window update frame which creates a large session flow control window
// 4] 6 priority frames for streams which will never be opened with headers
//    these streams (3, 5, 7, 9, b, d) build a dependency tree that all other
//    streams will be direct leaves of.
void Http2Session::SendHello() {
```
```text
// to help find any intermediaries speaking an older version of HTTP
const uint8_t Http2Session::kMagicHello[] = {
    0x50, 0x52, 0x49, 0x20, 0x2a, 0x20, 0x48, 0x54, 0x54, 0x50, 0x2f, 0x32,
    0x2e, 0x30, 0x0d, 0x0a, 0x0d, 0x0a, 0x53, 0x4d, 0x0d, 0x0a, 0x0d, 0x0a};
```

ここで，当初挙げていた Stream ID: 1 をなぜ Firefox が使わないのかが解決された．
Http2Session の初期化を見ると，Firefox では mNextStreamID が 3 から始まっていた．コメントでは，Stream ID 1 は HTTP/1.1 からの Upgrade handshake 用に予約されていると説明されている．そのため，TLS + ALPN によって直接 HTTP/2 connection を確立した今回の通信でも，Firefox 実装上は最初の通常 stream として 3 が使われたと考えられる．

```text
Http2Session::Http2Session(nsISocketTransport* aSocketTransport,
                           enum SpdyVersion version, bool attemptingEarlyData)
    : mSocketTransport(aSocketTransport),
      mSegmentReader(nullptr),
      mSegmentWriter(nullptr),
      kMaxStreamID(StaticPrefs::network_http_http2_max_stream_id()),
      mNextStreamID(3)  // 1 is reserved for Updgrade handshakes
      ,
```

> HTTP/1.1 requests that are upgraded to HTTP/2 (see Section 3.2) are
   responded to with a stream identifier of one (0x1). 
https://datatracker.ietf.org/doc/html/rfc7540#section-5.1.1

- Http2Session::Http2Session: https://searchfox.org/firefox-main/source/netwerk/protocol/http/Http2Session.cpp#172
- Http2Session::SendHello: https://searchfox.org/firefox-main/source/netwerk/protocol/http/Http2Session.cpp#1062


### 4.3. 本体 Channel Load

ここで時間を Speculative Connect と本体 Channel Load で分岐した所に戻り，本体側を進めていくことにする．

(要約)
最初の GET リクエストを追う．
まず Main Thread で nsHttpChannel が作成される．Speculative Connect と実際の接続 Transaction が Socket Thread に投げられる．
Socket Thread における Speculative Connect は先ほどの nsHttpHandler 経由と同じ．
Transaction では Session, Stream が作成され，HEADERS 生成後 SSL を介して GET リクエストが送信される．

説明の流れは以下の通り．
- 4.3.1. HttpChannel 作成:
本体 Channel Load 分岐点から，HttpChannel 作成までを追う．

- 4.3.2. (Re)Speculative Connect:
HttpChannel 経由で再度 Speculative Connect を Socket Thread に投げ，処理をするまでを追う．

- 4.3.3. Send GET Request:
(Re)Speculative Connect に分岐した所から，Transaction を Socket Thread に投げ，GET リクエストを送るまでを追う．

- 4.3.4. Recv GET Request / DOM:
Response を受け取ってから，Parse, Rendering し，DOM Content Loaded となるまでを追う．



#### 4.3.1. HttpChannel 作成

以下，Stack から情報が得られなかったのでコードと前後の Stack からの推測による Stack である．

```text
CanonicalBrowsingContext.fixupAndLoadURIString 
  -> nsDocShellLoadState::CreateFromLoadURIOptions 
    -> getFixupURIInfo 
  -> CanonicalBrowsingContext::LoadURI
    -> BrowsingContext::LoadURI
      -> nsDocShell::LoadURI
        -> nsDocShell::InternalLoad
          -> nsDocShell::DoURILoad
            -> DocumentChannel::CreateForDocument
            -> nsDocShell::OpenInitializedChannel
              -> nsURILoader::OpenURI
                -> nsHttpChannel::AsyncOpen
```

まず CreateFromLoadURIOptions で LoadState を作成した後，nsDocShell::InternalLoad に入り本体の Load が始まる．
その後，nsDocShell::DoURILoad で HttpChannel が作成され，nsHttpChannel::AsyncOpen で非同期に nsHttpChannel::AsyncOpenFinal を呼び出す．

??? note "ソースコードリンク"

    - CanonicalBrowsingContext::LoadURI: https://searchfox.org/firefox-main/source/docshell/base/BrowsingContext.cpp#2274
    - nsDocShell::LoadURI: https://searchfox.org/firefox-main/source/docshell/base/nsDocShell.cpp#715
    - nsDocShell::DoURILoad: https://searchfox.org/firefox-main/source/docshell/base/nsDocShell.cpp#9537
    - nsURILoader::OpenURI: https://searchfox.org/firefox-main/source/uriloader/base/nsURILoader.cpp#853
    - nsHttpChannel::AsyncOpen: https://searchfox.org/firefox-main/source/netwerk/protocol/http/nsHttpChannel.cpp#7463


#### 4.3.2. (Re)Speculative Connect

以下は Stack Chart から得られた情報．

(Main Thread)
```text
nsHttpChannel::AsyncOpenFinal
  -> nsHttpChannel::MaybeResolveProxyAndBeginConnect
    -> nsHttpChannel::ResolveProxy
      -> nsProtocolProxyService::AsyncResolveInternal (Speculative Connect で扱ったので callback まで略)
        -> nsProtocolProxyService::CallOnProxyAvailableCallback
          -> nsHttpChannel::OnProxyAvailable
            -> nsHttpChannel::BeginConnect (nsHttpChannel::CallOrWaitForResume を挟む)
                -> nsHttpChannel::PrepareToConnect
                  -> nsHttpChannel::ContinuePrepareToConnect (nsHttpChannel::CallOrWaitForResume を挟む)
                    -> nsHttpChannel::OnBeforeConnect
                      -> nsHttpChannel::MaybeUseHTTPSRRForUpgrade
                        -> nsHttpChannel::ContinueOnBeforeConnect (nsHttpChannel::CallOrWaitForResume を挟む)
                          -> nsHttpChannel::Connect
                            -> nsHttpChannel::ConnectOnTailUnblock
                              -> nsHttpChannel::SpeculativeConnect
                                -> nsHttpHandler::MaybeSpeculativeConnectWithHTTPSRR
                                  -> nsHttpConnectionMgr::SpeculativeConnect
                                    -> PostEvent(&nsHttpConnectionMgr::OnMsgSpeculativeConnect, 0, args)
```

まず，Main Thread で HttpChannel の Cookie や Auth Header など接続準備を整える．
続いて，ConnectOnTailUnblock で SpeculativeConnect と OpenCacheEntry の二系統の処理を行う．
ここでは SpeculativeConnect を見ると，以前扱ったように Socket Thread に PostEvent して終了する．

- nsHttpChannel::ResolveProxy: https://searchfox.org/firefox-main/source/netwerk/protocol/http/nsHttpChannel.cpp#4328
- nsHttpChannel::Connect: https://searchfox.org/firefox-main/source/netwerk/protocol/http/nsHttpChannel.cpp#1383

Socket Thread 側の処理は完全に同じであるため省略する．

(Socket Thread)
```text
-> nsHttpConnectionMgr::OnMsgSpeculativeConnect
    -> nsHttpConnectionMgr::DoSpeculativeConnection
    -> nsHttpConnectionMgr::DoSpeculativeConnectionInternal
        -> ConnectionEntry::CreateDnsAndConnectSocket
        -> ConnectionAttemptPool::StartConnectionEstablishment
            -> DnsAndConnectSocket::Init
              -> DnsAndConnectSocket::SetupEvent (以下，以前の Stack と同じため省略)
```

#### 4.3.3. Send GET Request

Speculative Connect 終了後，Transaction を Socket Thread に Dispatch し，GET リクエストを Http2 Session に載せて SSL を介して Server に投げる．

(Main Thread)
```text
nsHttpChannel::ConnectOnTailUnblock
　-> nsHttpChannel::OpenCacheEntry (nsHttpChannel::SpeculativeConnect と同じ階層)
    -> nsHttpChannel::OpenCacheEntryInternal
        -> CacheStorage::AsyncOpenURI
        　-> CacheStorage::AsyncOpenURIString
            -> CacheEntry::AsyncOpen
            　-> CacheEntry::Open
                -> CacheEntry::InvokeAvailableCallback
                  -> nsHttpChannel::OnCacheEntryAvailable
                    -> nsHttpChannel::OnCacheEntryAvailableInternal
                      -> nsHttpChannel::TriggerNetwork (nsHttpChannel::Connect の下に戻ってきた)
                        -> nsHttpChannel::ContinueConnect
                          -> nsHttpChannel::DoConnect
                            -> nsHttpChannel::DoConnectActual
                              -> nsHttpChannel::DispatchTransaction
                                -> nsHttpHandler::InitiateTransaction
                                  -> nsHttpConnectionMgr::AddTransaction
                                    -> PostEvent(&nsHttpConnectionMgr::OnMsgNewTransaction, priority, trans->AsHttpTransaction(), runnablePriority)
```

Speculative Connect の処理が終わった後，Cache の処理に進むが，今回はサイトキャッシュを削除する状態で条件を合わせているため，実際にリクエストを投げることになる．
HttpChannel 側で DispatchTransaction を実行すると，Handler,ConnectionMgr と進み Socket Thread で New Transaction Event が発火する．

- nsHttpChannel::DispatchTransaction: https://searchfox.org/firefox-main/source/netwerk/protocol/http/nsHttpChannel.cpp#1637
- nsHttpConnectionMgr::AddTransaction: https://searchfox.org/firefox-main/source/netwerk/protocol/http/nsHttpConnectionMgr.cpp#350

(Socket Thread)
```text
-> nsHttpConnectionMgr::OnMsgNewTransaction
  -> nsHttpConnectionMgr::ProcessNewTransaction
    -> nsHttpConnectionMgr::TryDispatchTransaction
      -> nsHttpConnectionMgr::DispatchTransaction
        -> nsHttpConnectionMgr::DispatchAbstractTransaction
          -> nsHttpConnection::Activate
            -> nsHttpConnection::AddTransaction
              -> Http2Session::AddStream 
                -> Http2Session::CreateStream 
                  -> Http2Session::ReadSegments 
                    -> Http2Session::ReadSegmentsAgain
                      -> Http2StreamBase::ReadSegments
                        -> nsHttpTransaction::ReadSegments
                          -> nsHttpTransaction::ReadRequestSegment
                            -> Http2StreamBase::OnReadSegment 
                              -> Http2Stream::GenerateOpen
                                -> Http2Stream::GenerateHeaders 
                                  -> Http2Compressor::EncodeHeaderBlock
                                    -> Http2Compressor::ProcessHeader
                              -> Http2StreamBase::TransmitFrame 
                                    -> Http2Session::FlushOutputQueue 
                                      -> nsHttpConnection::OnReadSegment 
                                          -> nsSocketOutputStream::Write 
                                            -> PSMSend 
                                              -> ssl_Send 
                                                -> ssl_SecureSend 
                                                  -> ssl3_SendApplicationData 
                                                    -> ssl3_SendRecord
                                                      -> __libc_send
```

TryDispatchTransaction でどの Connection に Transaction を Dispatch するか決める．
ここでは既存の HTTP/2 Connection を使えないか，idle な Connection を使えないかなどを見ており，新たに Connection を作成する場合もある (nsHttpConnectionMgr::MakeNewConnection)．

次に，既に Connection Preface など事前設定を済ませた Session に Stream を追加する．先ほど見たように，Firefox では 3 始まりである．
その後 Http2StreamBase::OnReadSegment の case 場合分けで Generate Header, Generate Body など処理を行った後 TransmitFrame から実際に Server に送る．

- nsHttpConnectionMgr::MakeNewConnection: https://searchfox.org/firefox-main/source/netwerk/protocol/http/nsHttpConnectionMgr.cpp#1356
- Http2StreamBase::OnReadSegment: https://searchfox.org/firefox-main/source/netwerk/protocol/http/Http2StreamBase.cpp#1157



さて，Recv GET Request に進む前に，以前疑問点として挙げた，謎の余剰 connection について調べたことを書いておく．
概ね 3. パケット解析で述べたが，Wireshark と Firefox Profiler を同時に使用して挙動とパケットを突き合わせた所，観察された事項は詳細には以下の通り．

- DNS 終了後 TCP Handshake が複数本始まる場合がある（1 本の場合も多かった）．実験で見られたパターンとしては次のようなものがあった．
1. 2/3 本同時 SYN スタート
2. 1 本が先に SYN，もう 1 本が 10-30ms 程度遅れて SYN
1, 2 ともに多数見られたが，1. の 3 本同時は一度しか観察できなかった．

- 最初に HTTP リクエストまで進んだコネクションを除いて，残りは 3. パケット解析で見たように TCP の段階で閉じられるか，HTTP の段階で閉じられるかした

- Profiler の Marker を観察すると，Speculative Connect が最初に行われた後，毎 HTTP GET リクエスト Speculative Connect が走っていた
- Profiler の Marker を観察すると，各 HTTP GET リクエストの時刻と Speculative Connect -> Dispatch Transaction -> Process New Transaction の一連の時刻が一致していた．
- Top Page については，Speculative Connect 後 Dispatch Transaction -> Process New Transaction が 2 回発生している場合があった．
  - これが起きるのは，TCP が 2 本貼られている場合と概ね一致していたので，関連があるのだろうと考えた．しかし，回数と本数が一致しないことも稀にあった．
  - さらに，時刻を見ると 1 本が Top Page の HTTP GET, もう 1 本が遅れて始まる TCP Handshake の時刻と一致していたので，Dispatch によって新たに Socket が作られる場合がありそうなことがわかった

これらの事象について，コードベースで解析をして，次のようなことを考えた．
- Speculative Connect -> Dispatch の流れは，先ほど見た通り本体 Channel Load 時の挙動と一致しているので，本体 Channel Load 前と合わせて，Speculative Connect は 2 回走ることになる
- Speculative Connect では HTTPSRR 終了後は nsHttpConnectionMgr::DoSpeculativeConnectionInternal -> ConnectionEntry::CreateDnsAndConnectSocket の流れがあるので，これで 2 本作られるのだろう
- TryDispatchTransaction では nsHttpConnectionMgr::MakeNewConnection を呼ぶことがあるが，こちらも CreateDnsAndConnectSocket を呼ぶので，Socket が作られる可能性のあるタイミングは合計 3 回ありそうだ

まとめると，少なくとも以下のように 3 つのルートがあるようだった．なお，CreateDnsAndConnectSocket の呼び出し元関数を Searchfox で調べると，ルートは SpeculativeConnect と TryDispatchTransaction のみであった．

A. URL Bar -> Speculative Connect -> HTTPS RR -> CreateDnsAndConnectSocket <br>
B. 本体 Channel Load -> Speculative Connect -> HTTPS RR -> CreateDnsAndConnectSocket <br>
C. 本体 Channel Load -> Cache, Proxy, Transaction 処理 -> TryDispatchTransaction -> CreateDnsAndConnectSocket

このように見ると，Dispatch Transaction の時刻が遅れた SYN の時刻と一致していたのは，B/C パターンだろうと推測できる．

nsHttpConnectionMgr::DoSpeculativeConnectionInternal と TryDispatchTransaction には新たに connection を作成する条件が記述されており，それによって新しく Socket が作成されるかどうか決まっている．条件としては，具体的には既に使える connection があるか？ Idle Connection はあるか？などを調べている．
このような条件を満たすかどうかは，connection 作成レースによるものなので，実行毎に挙動が変わるという事が起きるのだった．

ログを確認すると，A パターン, C パターンからそれぞれ Socket が作成されている様子が確認できた．
```text
21: 2026-05-14 02:57:06.404683 UTC - [Parent 1351414: Socket Thread]: V/nsHttp nsHttpConnectionMgr::OnMsgSpeculativeConnect [ci=.S.........[tlsflags0x00000000]www.shonenjump.com:443^partitionKey=%28https%2Cshonenjump.com%29, mFetchHTTPSRR=1]
291: 2026-05-14 02:57:06.419081 UTC - [Parent 1351414: Socket Thread]: V/nsHttp Creating DnsAndConnectSocket [this=e415e4aa5800 trans=e415dbad2c80 ent=www.shonenjump.com key=.S.........[tlsflags0x00000000]www.shonenjump.com:443^partitionKey=%28https%2Cshonenjump.com%29]

413: 2026-05-14 02:57:06.424186 UTC - [Parent 1351414: Socket Thread]: V/nsHttp nsHttpConnectionMgr::OnMsgSpeculativeConnect [ci=.S.........[tlsflags0x00000000]www.shonenjump.com:443^partitionKey=%28https%2Cshonenjump.com%29, mFetchHTTPSRR=1]
446: 2026-05-14 02:57:06.424585 UTC - [Parent 1351414: Socket Thread]: V/nsHttp nsHttpConnectionMgr::TryDispatchTransactionOnIdleConn, ent=e415ea2baba0, trans=e415da79b000, urgent=1
447: 2026-05-14 02:57:06.424590 UTC - [Parent 1351414: Socket Thread]: V/nsHttp nsHttpConnectionMgr::MakeNewConnection e4160f040a00 ent=e415ea2baba0 trans=e415da79b000
558: 2026-05-14 02:57:06.425338 UTC - [Parent 1351414: Socket Thread]: V/nsHttp Creating DnsAndConnectSocket [this=e415ed104200 trans=e415de140120 ent=www.shonenjump.com key=.S.........[tlsflags0x00000000]www.shonenjump.com:443^partitionKey=%28https%2Cshonenjump.com%29]
```

以上から，余剰に見える TCP connection は，単一の処理が無条件に複数 Socket を作っているというより，複数の接続開始パターンが近接して発生し，それぞれが connection manager の状態を見ながら接続試行を開始するために現れるものだと考えられる．これには上記のように少なくとも 3 つのパターンがあった．
これらはいずれも最終的に CreateDnsAndConnectSocket に到達し得る．nsHttpConnectionMgr は既存の active connection，idle connection，接続中の DnsAndConnectSocket などを確認してから新規接続を作るため，どの接続試行が先に登録・確立されるかというタイミングの差によって，実行ごとに 1 本だけの場合，2 本貼られる場合，稀に 3 本近く見える場合が生じる．

なお，余剰 connection をいつ閉じているかについては，調査が間に合わなかった．


#### 4.3.4. Recv GET Request / DOM

先ほどは Main Thread から追ったが，今度は Socket Thread から Main Thread, そして Content Process へと移っていく．

流れとしては，まず Socket Thread で実際に Socket からデータを受け取った後，Transaction のパイプを通して Main Thread にデータを流す．
次に，Parent Process / Main Thread から Content Process に Process を切り替え処理を行い，Content Process 側は nsWebBrowser を初期化する．
さらに， HttpChannelParent, HttpChannelChild の Setup 終了後，Content Process に受信，処理開始を指示する．
Content Process は HTML Document 作成，HTML5 Parser Thread に処理を依頼する．

Parse が済むと，必要な css,js,img のロードへと移り，適宜 JS を実行する．最終的に DOMContentLoaded Event を発火して読み込みが終了する．

まずは，最初の Socket Thread から見ていく．

(Parent Process/ Socket Thread)
```text
nsSocketTransportService::DoPollIteration 
  -> nsSocketTransport::OnSocketReady 
    -> nsSocketInputStream::OnSocketReady 
      -> nsHttpConnection::OnInputStreamReady 
        -> nsHttpConnection::OnSocketReadable 
          -> Http2Session::WriteSegmentsAgain 
            -> Http2Session::WriteSegmentsAgain
              ->Http2StreamBase::WriteSegments
                -> nsHttpTransaction::WriteSegments
                  -> nsPipeOutputStream::WriteSegments
                    -> nsHttpTransaction::WritePipeSegment
                      -> Http2Session::OnWriteSegment
                        -> Http2Session::NetworkRead 
                          -> nsHttpConnection::OnWriteSegment 
                            -> nsSocketInputStream::Read 
                              -> PSMRecv 
                                -> ssl_Recv 
                                  -> ssl_SecureRecv 
                                    -> DoRecv 
                                      -> ssl3_GatherAppDataRecord 
                                        -> ssl3_GatherCompleteHandshake 
                                          -> ssl3_GatherData 
                                            -> __libc_recv
```

受信側では，poll loop が readable な Socket を検出し，nsHttpConnection::OnSocketReadable() から HTTP/2 Session に制御が渡る．Http2Session::NetworkRead は TLS 層から復号済みの Application Data を読み出し，それを HTTP/2 Frame として Session に取り込む側である．Stack に ssl3_GatherAppDataRecord が見えていることから，この段階ではすでに handshake message ではなく application data record を読んでいることが分かる．受信した Frame は Session 内で stream ID ごとに対応づけられ，それぞれの Transaction に返される．
順序がわかりにくいが，Session が Frame Header を読んで適切な Stream に割り当て，Stream が対応する Transaction に割り当て，Transaction が Session callback から読ませ，Main Thread と繋がっているパイプに書き込むという流れである．

パイプに書き込むことで，Main Thread 側の処理が発火する．

??? note "ソースコードリンク"

    - Http2Session::WriteSegmentsAgain: https://searchfox.org/firefox-main/source/netwerk/protocol/http/Http2Session.cpp#2901
    - nsHttpTransaction::WritePipeSegment: https://searchfox.org/firefox-main/source/netwerk/protocol/http/nsHttpTransaction.cpp#874
    - Http2Session::OnWriteSegment: https://searchfox.org/firefox-main/source/netwerk/protocol/http/Http2Session.cpp#3746


(Parent Process / Main Thread)
ほぼ同時刻に開始した Main Thread で見られた Stack が以下の通り．

nsInputStreamPump でパイプ読み取りを検知した後，
CanonicalBrowsingContext::ChangeRemoteness で Content Process に切り替えを行う．
さらに，IPC から Content Process に優先度変更の通知も行なっている．

```text
nsInputStreamPump::OnStateStart
  -> nsInputStreamPump::OnInputStreamReady
    -> nsInputStreamPump::OnStateStart
      -> nsHttpChannel::OnStartRequest
        -> nsHttpChannel::ProcessResponse 
          -> nsHttpChannel::ContinueProcessResponse1 
            -> nsHttpChannel::ContinueProcessResponse2 
              -> nsHttpChannel::ContinueProcessResponse3 
                -> nsHttpChannel::ContinueProcessNormal 
                  -> nsHttpChannel::ContinueProcessNormal3 
                    -> nsHttpChannel::CallOnStartRequest 
                      -> nsStreamListenerTee::OnStartRequest 
                        -> nsStreamListenerWrapper::OnStartRequest
                          -> nsStreamListenerWrapper::OnStartRequest
                            -> ParentProcessDocumentOpenInfo::OnStartRequest
                              -> ParentProcessDocumentOpenInfo::OnDocumentStartRequest
                                -> nsDocumentOpenInfo::OnStartRequest
                                  -> ParentChannelListener::OnStartRequest
                                    -> DocumentLoadListener::DoOnStartRequest
                                      -> DocumentLoadListener::MaybeTriggerProcessSwitch
                                        -> DocumentLoadListener::TriggerProcessSwitch
                                          -> CanonicalBrowsingContext::ChangeRemoteness
                                            -> ContentParent::GetNewOrUsedLaunchingBrowserProcess
                                              -> ContentParent::GetUsedBrowserProcess
                                                -> ProcessPriorityManager::SetProcessPriority
                                                  -> ProcessPriorityManagerImpl::SetProcessPriority
                                                    -> ParticularProcessPriorityManager::SetPriorityNow
                                                      -> PContent::Msg_NotifyProcessPriorityChanged
                                                        -> PContentParent::SendNotifyProcessPriorityChanged
                                                          -> ipc::IProtocol::ChannelSend
                                                            -> ipc::MessageChannel::Send
                                                              -> ipc::MessageChannel::SendMessageToLink
                                                                -> ipc::PortLink::SendMessage
                                                                  -> (中略) __libc_sendmsg
```

Content Process の方では IPC を受け取り，nsWebBrowser を作成・初期化している．

(Content Process / Main Thread)
```text
ipc::MessageChannel::DispatchAsyncMessage
-> PContent::Msg_ConstructBrowser
  -> PContentChild::OnMessageReceived
    -> ContentChild::RecvConstructBrowser
      -> BrowserChild::Init
        -> nsWebBrowser::Create
          -> nsDocShell::Initialize
            -> nsDocShell::CreateInitialDocumentViewer
            -> nsDocShell::CreateAboutBlankDocumentViewer
              -> nsDocShell::Embed
                -> nsDocShell::SetupNewViewer
                  -> nsDocumentViewer::InitInternal
```


続いて， HttpChannelParent 及び HttpChannelChild の準備が整った後，いよいよ Content Process で HttpChannelChild::OnStartRequest から本処理が始まったことが Stack から観察できた．

(Parent Process / Main Thread)
```text
BackgroundChannelRegistrar::LinkBackgroundChannel
-> BackgroundChannelRegistrar::NotifyChannelLinked
  -> HttpChannelParent::OnBackgroundParentReady
    -> (中略) DocumentLoadListener::ReadyToVerify
      -> DocumentLoadListener::FinishReplacementChannelSetup
        -> DocumentLoadListener::ResumeSuspendedChannel
          -> (中略) ContentParent::AboutToLoadHttpDocumentForChild
```

(Content Process/ Main Thread)
```text
ChannelEventQueue::FlushQueue
-> HttpChannelChild::OnStartRequest
  -> HttpChannelChild::DoOnStartRequest
    -> nsDocumentOpenInfo::OnStartRequest
      -> nsDocumentOpenInfo::DispatchContent
        -> nsDocumentOpenInfo::TryContentListener
          -> nsDSURIContentListener::DoContent
            -> nsDocShell::CreateDocumentViewer
              -> nsDocShell::Embed
                -> nsDocShell::SetupNewViewer
                  -> nsDocumentViewer::InitInternal
              -> nsDocShell::NewDocumentViewerObj (ここから推測)
                -> nsContentDLF::CreateInstance
                  -> CreateDocument
                    -> nsHTMLDocument::StartDocumentLoad
                      -> nsHtml5Module::NewHtml5Parser
```

CreateDocument では HTML/XML/SVG など Type によって作成する Document を分けており，今回は HTMLDocument となる．
HTML5 Parser Thread がこの後動き出した所から見て，この時点で NewHtml5Parser が実行された推測は正しいだろう．

??? note "ソースコードリンク"

    - nsDocShell::CreateDocumentViewer: https://searchfox.org/firefox-main/source/docshell/base/nsDocShell.cpp#6855
    - nsDocShell::NewDocumentViewerObj: https://searchfox.org/firefox-main/source/docshell/base/nsDocShell.cpp#7101
    - nsContentDLF::CreateInstance: https://searchfox.org/firefox-main/source/layout/build/nsContentDLF.cpp#164
    - CreateDocument: https://searchfox.org/firefox-main/source/layout/build/nsContentDLF.cpp#107
    - nsHTMLDocument::StartDocumentLoad: https://searchfox.org/firefox-main/source/dom/html/nsHTMLDocument.cpp#283
    - nsHtml5Module::NewHtml5Parser: https://searchfox.org/firefox-main/source/parser/html/nsHtml5Module.cpp#66


HTML5 Parser Thread にどの処理で Dispatch されたかは特定できなかったが，ほぼ同時刻に次のような Stack が観察され Parse が開始されたと見られる．

(Content Process / HTML5 Parser Thread)
```text
HttpChannelChild::OnTransportAndData
  -> HttpChannelChild::DoOnDataAvailable
    ->nsHtml5StreamListener::OnDataAvailable
      -> nsHtml5StreamParser::OnDataAvailable
        -> nsHtml5StreamParser::DoDataAvailableBuffer
          -> nsHtml5StreamParser::DoDataAvailable
            -> nsHtml5StreamParser::ParseAvailableData
              -> nsHtml5Tokenizer::tokenizeBuffer
                -> nsHtml5Tokenizer::StateLoopLineColSIMD
                  -> nsHtml5Tokenizer::stateLoop
                    -> nsHtml5Tokenizer::emitCurrentTagToken
                      -> nsHtml5TreeBuilder::startTag
                        -> nsHtml5TreeBuilder::appendVoidElementToCurrentMayFoster
                          -> nsHtml5TreeBuilder::createElement
```


本体の Parse が実行されると，Main Thread では次のように，CSS/JS/IMG のロードが行われた．

```text
nsHtml5LoadFlusher::Run
  -> nsHtml5TreeOpExecutor::FlushSpeculativeLoads
    -> nsHtml5SpeculativeLoad::Perform
      -> nsHtml5TreeOpExecutor::PreloadStyle
        -> dom::Document::PreloadStyle
          -> css::Loader::LoadSheet
            -> ss::Loader::InternalLoadNonDocumentSheet
              -> css::Loader::LoadSheet
                -> css::Loader::LoadSheetAsyncInternal
                  -> HttpChannelChild::AsyncOpen
                    -> HttpChannelChild::AsyncOpenInternal
                      -> HttpChannelChild::ContinueAsyncOpen
                        -> nsLoadGroup::AddRequest
                          -> nsDocShell::OnStartRequest
                            -> nsDocLoader::OnStartRequest
                              -> nsDocLoader::FireOnStateChange
                                -> nsDocLoader::GatherAncestorWebProgresses
        -> nsHtml5TreeOpExecutor::PreloadScript (PreloadStyle と同じ階層)
          -> dom::ScriptLoader::PreloadURI
            -> dom::ScriptLoader::StartLoad
              -> dom::ScriptLoader::StartClassicLoad
                -> dom::ScriptLoader::StartLoadInternal
                  -> HttpChannelChild::AsyncOpen (以下略)
        -> nsHtml5TreeOpExecutor::PreloadImage
          -> mozilla::dom::Document::MaybePreLoadImage
            -> mozilla::dom::Document::PreLoadImage
              -> nsContentUtils::LoadImage
                -> imgLoader::LoadImage https://www.shonenjump.com/j/common/img/iconFB.png (など，画像名が大量)
                  -> HttpChannelChild::AsyncOpen (以下略)
```

さらに続けて nsHtml5TreeOpExecutor::RunScript で JS が実行され，HttpChannelChild::ProcessOnStopRequest も実行された．おそらくこれで Top Page HTML に書かれていた追加リソースの取得リクエストは一通り投げ終えたと見られる．

nsHtml5TreeOpExecutor に注目して Stack を調べると，時間を空けて途中で次のような Stack が見えたので，追加の JS を実行したと見られる．
外部 JS 実行や inline script 実行の様子や，Layout が行われている様子も見られた．

```text
nsHtml5TreeOpExecutor::RunScript
-> nsIScriptElement::AttemptToExecute
  -> dom::ScriptElement::MaybeProcessScript
    -> dom::ScriptLoader::ProcessScriptElement
      -> dom::ScriptLoader::ProcessExternalScript
        -> dom::ScriptLoader::CheckContentPolicy
```

(さらにまた別の Stack)
```text
dom::ScriptElement::MaybeProcessScript
-> dom::ScriptLoader::ProcessScriptElement
  -> dom::ScriptLoader::ProcessInlineScript
    -> dom::ScriptLoader::ProcessRequest
      -> dom::ScriptLoader::EvaluateScriptElement
        -> EvaluateScript
          -> dom::ScriptLoader::InstantiateClassicScriptFrom
            -> dom::ScriptLoader::InstantiateClassicScriptFromMaybeEncodedSource
```

```text
nsHtml5TreeOpExecutor::RunFlushLoop
-> Layout https://www.shonenjump.com/j/weeklyshonenjump/
  -> nsCSSFrameConstructor::ContentRangeInserted
```

最終的に DOMContentLoaded が Dispatch され，ページの読み込みが完了した．

```text
mozilla::dom::Document::DispatchContentLoadedEvents
  -> (中略) EventDispatcher::Dispatch DOMContentLoaded
```


(まとめ)
本章では，3章の packet capture で観測した DNS，TCP/TLS，HTTP/2 request/response が，Firefox 内部でどのように発生しているかを追った．URL bar で Enter key が押されると，UrlbarInput から URILoadingHelper，tabbrowser，RemoteWebNavigation へ処理が進み，ここで Speculative Connect と本体の Document Load に分かれる．

Speculative Connect 側では，proxy 解決を経て nsHttpHandler / nsHttpConnectionMgr に処理が渡り，Socket Thread 上で DNS 解決，TCP connection，TLS handshake，HTTP/2 connection preface までが進む．一方，本体 Channel Load 側では nsHttpChannel が作成され，nsHttpTransaction が nsHttpConnectionMgr に dispatch される．利用可能な HTTP/2 connection 上に stream が作成され，HEADERS frame として /j/weeklyshonenjump/ の GET request が送られる．

Response は Socket Thread 側で HTTP/2 frame として処理され，nsHttpTransaction の pipe を通じて Main Thread 側の nsInputStreamPump / nsHttpChannel に渡る．その後，DocumentLoadListener などを経由して Content Process 側で document の作成と HTML parsing が始まり，CSS，JS，画像などの追加 resource load が発生する．

また，疑問点として挙げた 3 点について，次のような結論が得られた．

1. DNS HTTPS/A/AAAA レコード発出の順序: 4.2.節の DNS
  -> Firefox の仕様ではなく，systemd-resolved の実装を確認する必要がある
2. HTTP/2 で Stream ID: 1 を使用しない理由
  -> HTTP/1 から upgrade される前に送られたリクエストを StreamID: 1 として扱うため，通常の StreamID を 3 始まりにしていた
3. 複数の TCP connection を立てて，片方をすぐに閉じた理由
  -> Connection 作成へのルートが複数あり，タイミングの差によって新規に作成されるかどうかが決まる　閉じる挙動については未調査

処理の繋がりに途切れがなるべくないように追っていったため，非常に長くなってしまったが，パケットの裏側にある Client サイドアプリケーション層の本筋はかなり抑えられたのではないかと考える．


## 5. TCP 解析

ここまでの解析で，Firefox 側では DNS 解決の後に socket を作り，TLS handshake に進んでいることが分かった．
しかし packet capture に見えている SYN/SYN-ACK/ACK や，その直後に TLS/HTTP2 を運ぶ connection の管理は，Firefox ではなく Linux kernel の TCP 実装が担っている．

本章では TCP の state machine が Linux kernel でどう実装されているか，特に Handshake について追う．

1. Client send SYN
2. Server recv SYN, send SYN/ACK
3. Client recv SYN/ACK, send ACK, ESTABLISHED
4. Server recv ACK, child socket ESTABLISHED

### 5.1.  Client send SYN

Firefox が connect syscall を呼び出すと，Client 側は次のような流れになる．

```text
__inet_stream_connect
-> sk->sk_prot->connect
  -> tcp_v4_connect
    -> ip_route_connect (route lookup)
    -> tcp_set_state(sk, TCP_SYN_SENT)
    -> inet_hash_connect (ephemeral port の割り当て・hash table への登録)
    -> tcp_connect
```

tcp_v4_connect からが本処理であり，tcp_v4_connect では，まず経路探索を行い，その後，socket を TCP_SYN_SENT に遷移させる．続いて inet_hash_connect により local port の割り当て・hash table への登録を行い，最終的に tcp_connect によって SYN 用の skb を作成・送信する．

- tcp_v4_connect: https://github.com/torvalds/linux/blob/master/net/ipv4/tcp_ipv4.c#L221
- tcp_connect: https://github.com/torvalds/linux/blob/master/net/ipv4/tcp_output.c#L4292

### 5.2. Server recv SYN, send SYN/ACK

Server 側は LISTEN 状態から受け付けており，自分から connect する訳ではない．
処理は tcp_rcv_state_process から state に応じて分岐しており，TCP_LISTEN case では，受信した segment に SYN flag が立っていることを確認して，icsk->icsk_af_ops->conn_request (IPv4 では tcp_v4_conn_request) を呼び出す．

ここでは，まだ通常の接続済み socket を作るのではなく，軽量な request_sock に接続要求の情報を保持し，tcp_v4_send_synack から SYN/ACK を送り出す．

```text
tcp_rcv_state_process (case TCP_LISTEN)
-> icsk->icsk_af_ops->conn_request
  -> tcp_v4_conn_request
    -> tcp_conn_request
      -> af_ops->send_synack
        -> tcp_v4_send_synack
```

```text
	case TCP_LISTEN:
		if (th->ack)
			return SKB_DROP_REASON_TCP_FLAGS;

		if (th->rst) {
			SKB_DR_SET(reason, TCP_RESET);
			goto discard;
		}
		if (th->syn) {
			if (th->fin) {
				SKB_DR_SET(reason, TCP_FLAGS);
				goto discard;
			}
			/* It is possible that we process SYN packets from backlog,
			 * so we need to make sure to disable BH and RCU right there.
			 */
			rcu_read_lock();
			local_bh_disable();
			icsk->icsk_af_ops->conn_request(sk, skb);
			local_bh_enable();
			rcu_read_unlock();

			consume_skb(skb);
			return 0;
		}
```

??? note "ソースコードリンク"

    - tcp_rcv_state_process: https://github.com/torvalds/linux/blob/master/net/ipv4/tcp_input.c#L7119
    - tcp_conn_request: https://github.com/torvalds/linux/blob/master/net/ipv4/tcp_input.c#L7587
    - tcp_v4_send_synack: https://github.com/torvalds/linux/blob/master/net/ipv4/tcp_ipv4.c#L1159


### 5.3. Client recv SYN/ACK, send ACK, ESTABLISHED

```text
tcp_rcv_state_process (case TCP_SYN_SENT)
-> tcp_rcv_synsent_state_process
  -> tcp_finish_connect
    -> tcp_set_state(sk, TCP_ESTABLISHED);
  -> tcp_send_ack_reflect_ect
    -> __tcp_send_ack
```

tcp_rcv_state_process で TCP_SYN_SENT case に入った後，tcp_rcv_synsent_state_process が呼び出される．ここでは RST, ACK, SYN の有無や ACK 番号の妥当性が検証される．妥当な SYN/ACK であれば，TCP option などを反映した後，tcp_finish_connect に進み，tcp_finish_connect 内で TCP_ESTABLISHED となる．続いて tcp_send_ack_reflect_ect が呼び出され，ここで最終 ACK が送られる．

```text
case TCP_SYN_SENT:
		tp->rx_opt.saw_tstamp = 0;
		tcp_mstamp_refresh(tp);
		queued = tcp_rcv_synsent_state_process(sk, skb, th);
		if (queued >= 0)
			return queued;

		/* Do step6 onward by hand. */
		tcp_urg(sk, skb, th);
		__kfree_skb(skb);
		tcp_data_snd_check(sk);
		return 0;
	}
```

- tcp_rcv_synsent_state_process: https://github.com/torvalds/linux/blob/master/net/ipv4/tcp_input.c#L6819
- tcp_finish_connect: https://github.com/torvalds/linux/blob/master/net/ipv4/tcp_input.c#L6700

### 5.4. Server recv ACK, child socket ESTABLISHED

```text
tcp_v4_rcv (case TCP_NEW_SYN_RECV)
-> tcp_check_req
-> tcp_child_process
  -> tcp_rcv_state_process (case TCP_SYN_RECV)
    -> tcp_set_state(sk, TCP_ESTABLISHED)
```

最終 ACK が届くと，LISTEN socket に対応する pending request が確認され，そこから接続済み通信用の child socket が作られる．以後の処理はこの child socket に対して行われ，TCP_SYN_RECV から TCP_ESTABLISHED へ遷移する．したがって，アプリケーションが accept で受け取るのは LISTEN socket そのものではなく，この ESTABLISHED になった child socket である．

- tcp_rcv_state_process case TCP_SYN_RECV: https://github.com/torvalds/linux/blob/master/net/ipv4/tcp_input.c#L7218

以上，TCP Handshake における State 遷移を追った．
Handshake 後は tcp_rcv_established をベースに処理が行われる．
ここでは，fast path, slow path に分かれ，通常の処理の他 out-of-order などの順序制御が行われる．これらの connection 管理の上に TLS や HTTP/2 が流れていることになる．

tcp_rcv_established の解説として以下も参考にした．
https://www.cnblogs.com/wanpengcoder/p/11752050.html



## 6. ネットワーク経路解析

(注: Mac Address 部分を HOST_BRIDGE_MAC などに置換しています)

5.TCP 解析では，connect() 呼び出し以後，Linux kernel が route lookup を行い，source address / source port を決め，SYN を送るまでを追った．
しかし，そこまでで分かるのはあくまで VM 内の話であり，その SYN が実際にどこを通って server に届き，その返事がどう戻ってくるかは別に追う必要がある．

本章では，https://www.shonenjump.com/j/weeklyshonenjump/ に対する最初の TCP connection を例に，

```text
VM で SYN 作成
-> Host macOS
-> ルータ・ISP・IX を経て server
-> SYN/ACK が 逆向きに戻る
```

という 1 往復を追う．VM<->Host, Host 内 NAT, Host<->Server の順で扱う．

### 6.1. VM <-> Host
まず，デフォルトゲートウェイを決める．

5章で見た通り，connect を呼ぶと Linux kernel は tcp_v4_connect で route lookup を行う．
今回，VM 上で実際に route を確認すると次のようになっていた．

```text
$ ip route
default via 192.168.64.1 dev enp0s1 proto dhcp src 192.168.64.6 metric 100
192.168.64.0/24 dev enp0s1 proto kernel scope link src 192.168.64.6 metric 100

$ ip route get 202.218.223.232
202.218.223.232 via 192.168.64.1 dev enp0s1 src 192.168.64.6
```

これにより，202.218.223.232 に対して次のようなことが決まる．
- interface: enp0s1
- source address: 192.168.64.6 
- next hop: 192.168.64.1

(参考: https://qiita.com/shiyasu/items/7490ff01a4fe1c7ad61f)

次に，next hop である 192.168.64.1 の　MAC address を知る必要がある．

Wireshark でも ARP が観測できた．
```text
11	27.855575458	VM_MAC	HOST_BRIDGE_MAC	ARP	42	Who has 192.168.64.1? Tell 192.168.64.6
12	27.856407440	HOST_BRIDGE_MAC	VM_MAC	ARP	42	192.168.64.1 is at HOST_BRIDGE_MAC
```

これにより

- 192.168.64.1 (Host): HOST_BRIDGE_MAC
- 192.168.64.6 (VM): VM_MAC

であることがわかる．これによって Ethernet destination を HOST_BRIDGE_MAC にしてフレームを VM -> Host に送る事ができる．

### 6.2. Host 内 NAT

2.情報収集で見た通り，192.168.64.1 は bridge100/vmnet0 である．
bridge100 を見ると，確かに両者は同じ L2 segment にいる事がわかる．


```text
$ arp -an
? (169.254.169.254) at (incomplete) on en0 [ethernet]
? (192.168.3.1) at ROUTER_MAC on en0 ifscope [ethernet]
? (192.168.3.16) at LAN_DEVICE_MAC on en0 ifscope [ethernet]
? (192.168.3.17) at HOST_EN0_MAC on en0 ifscope permanent [ethernet]
? (192.168.3.19) at (incomplete) on en0 ifscope [ethernet]
? (192.168.3.255) at BROADCAST_MAC on en0 ifscope [ethernet]
? (192.168.64.1) at HOST_BRIDGE_MAC on bridge100 ifscope permanent [bridge]
? (192.168.64.6) at VM_MAC on bridge100 ifscope [bridge]
? (192.168.64.255) at BROADCAST_MAC on bridge100 ifscope [bridge]
? (224.0.0.251) at MULTICAST_MAC on en0 ifscope permanent [ethernet]
? (224.0.0.251) at MULTICAST_MAC on bridge100 ifscope permanent [ethernet]
? (239.255.255.250) at MULTICAST_MAC on en0 ifscope permanent [ethernet]
```

さて，ここまでで VM -> Host の通信が追えたが，次に Host から出る必要がある．
Host 側で確認すると，interface が VM 向きは bridge1000, 202.218.223.232 向きは en0 であることが分かった．

```text
$ route -n get 202.218.223.232
   route to: 202.218.223.232
destination: default
       mask: default
    gateway: 192.168.3.1
  interface: en0
      flags: <UP,GATEWAY,DONE,STATIC,PRCLONING,GLOBAL>
 recvpipe  sendpipe  ssthresh  rtt,msec    rttvar  hopcount      mtu     expire
       0         0         0         0         0         0      1500         0 

$ route -n get 192.168.64.6
   route to: 192.168.64.6
destination: 192.168.64.6
  interface: bridge100
      flags: <UP,HOST,DONE,LLINFO,WASCLONED,IFSCOPE,IFREF>
 recvpipe  sendpipe  ssthresh  rtt,msec    rttvar  hopcount      mtu     expire
       0         0         0         0         0         0      1500      1138 
```

(参考: https://ytsuboi.jp/archives/182)


en0, bridge100 について次のように IP, MAC アドレスが分かる．bridge100 については，先ほどの情報と一致している．

- en0: 192.168.3.4, HOST_EN0_MAC
- bridge100: 192.168.64.1, HOST_BRIDGE_MAC
```text
$ ifconfig en0
en0: flags=8963<UP,BROADCAST,SMART,RUNNING,PROMISC,SIMPLEX,MULTICAST> mtu 1500
        options=6460<TSO4,TSO6,CHANNEL_IO,PARTIAL_CSUM,ZEROINVERT_CSUM>
        ether HOST_EN0_MAC
        inet6 fe80::HOST_EN0_LINK_LOCAL%en0 prefixlen 64 secured scopeid 0xb 
        inet6 GLOBAL_IPV6_ADDRESS prefixlen 64 autoconf secured 
        inet6 TEMPORARY_GLOBAL_IPV6_ADDRESS prefixlen 64 autoconf temporary 
        inet 192.168.3.4 netmask 0xffffff00 broadcast 192.168.3.255
        nd6 options=201<PERFORMNUD,DAD>
        media: autoselect
        status: active
$ ifconfig bridge100
bridge100: flags=8b63<UP,BROADCAST,SMART,RUNNING,PROMISC,ALLMULTI,SIMPLEX,MULTICAST> mtu 1500
        options=3<RXCSUM,TXCSUM>
        ether HOST_BRIDGE_MAC
        inet 192.168.64.1 netmask 0xffffff00 broadcast 192.168.64.255
        inet6 fe80::HOST_BRIDGE_LINK_LOCAL%bridge100 prefixlen 64 scopeid 0x1a 
        inet6 fde1:5b59:b17d:7a3c:18e6:7fa1:6821:67be prefixlen 64 autoconf secured 
        Configuration:
                id 0:0:0:0:0:0 priority 0 hellotime 0 fwddelay 0
                maxage 0 holdcnt 0 proto stp maxaddr 100 timeout 1200
                root id 0:0:0:0:0:0 priority 0 ifcost 0 port 0
                ipfilter disabled flags 0x0
        member: vmenet0 flags=3<LEARNING,DISCOVER>
                ifmaxaddr 0 port 25 priority 0 path cost 0
        Address cache:
                VM_MAC Vlan1 vmenet0 1172 flags=0<>
        nd6 options=201<PERFORMNUD,DAD>
        media: autoselect
        status: active
```

また，bridge100, en0 で同時に Wireshark を用いてキャプチャすると，次のように変換されていることがわかる．これは先ほどの en0, bridge100 の情報と一致している．
ただしポート番号は ephemeral なものである． 

- bridge100: 192.168.64.6:38848
- en0: 192.168.3.4:38452

すなわち，VM とインターネットの間には Host による NAT が入っていることがわかる．

(bridge100)
```text
139	14.338961	192.168.64.6	202.218.223.232	TCP	74	38848 → 443 [SYN] Seq=0 Win=64240 Len=0 MSS=1460 SACK_PERM TSval=3905586345 TSecr=0 WS=1024
141	14.348068	202.218.223.232	192.168.64.6	TCP	74	443 → 38848 [SYN, ACK] Seq=0 Ack=1 Win=28960 Len=0 MSS=1240 SACK_PERM TSval=391991150 TSecr=3905586345 WS=32
142	14.348468	192.168.64.6	202.218.223.232	TCP	66	38848 → 443 [ACK] Seq=1 Ack=1 Win=64512 Len=0 TSval=3905586355 TSecr=391991150
143	14.349512	192.168.64.6	202.218.223.232	TCP	1294	38848 → 443 [ACK] Seq=1 Ack=1 Win=64512 Len=1228 TSval=3905586356 TSecr=391991150 [TCP PDU reassembled in 144]
144	14.349512	192.168.64.6	202.218.223.232	TLSv1.3	739	Client Hello (SNI=www.shonenjump.com)
```

(en0)
```text
933	36.784176	192.168.3.4	202.218.223.232	TCP	74	38452 → 443 [SYN] Seq=0 Win=64240 Len=0 MSS=1240 SACK_PERM TSval=3905586345 TSecr=0 WS=1024
935	36.793111	202.218.223.232	192.168.3.4	TCP	74	443 → 38452 [SYN, ACK] Seq=0 Ack=1 Win=28960 Len=0 MSS=1420 SACK_PERM TSval=391991150 TSecr=3905586345 WS=32
936	36.793638	192.168.3.4	202.218.223.232	TCP	66	38452 → 443 [ACK] Seq=1 Ack=1 Win=64512 Len=0 TSval=3905586355 TSecr=391991150
937	36.794644	192.168.3.4	202.218.223.232	TCP	1294	38452 → 443 [ACK] Seq=1 Ack=1 Win=64512 Len=1228 TSval=3905586356 TSecr=391991150 [TCP PDU reassembled in 938]
938	36.794659	192.168.3.4	202.218.223.232	TLSv1.3	739	Client Hello (SNI=www.shonenjump.com)
```

### 6.3. Host <-> Server

さて，いよいよ en0 を通って Server へと追っていく．
Host の next hop は 192.168.3.1 であったが，これは自宅 Wi-Fi である．2. 情報収集の traceroute を再掲すると以下の通り．ルータより先についてはおそらく調べようがないので割愛する．

1. 192.168.64.1
2. 192.168.3.1 (ルータ)
3. 221.110.222.214 (bbtec.net) (AS17676 ソフトバンク株式会社)
4. 221.110.222.213 (bbtec.net) 
5. 101.203.70.90 (BBIX)
6. 202.218.223.232 (server) (AS4694 株式会社IDCフロンティア)
(途中 \*\*\* hop 略)

まとめると，VM 内から Server までは次のような経路になっていることが分かった．

```text
VM enp0s1: 192.168.64.6, VM_MAC
<-> Host bridge100, 192.168.64.1, HOST_BRIDGE_MAC
<-> Host en0, 192.168.3.4, HOST_EN0_MAC
<-> router, 192.168.3.1, ROUTER_MAC
<-> Softbank 系ネットワーク
<-> BBIX
<-> IDCF 側ネットワーク
<-> 202.218.223.232
```


## 7. サーバ側解析

6.ネットワーク経路解析では，Firefox が作った packet が VM を出て 202.218.223.232 に届き，その返事が戻ってくるまでを追った．
本章では，Response Header の server: Apache を手がかりに，server 側で Apache HTTP Server が関与していると見なした場合に，どのような処理が起きていると考えられるかを整理する．

先に限界を書くと，今回は server にログインしていないので，

- Apache の version
- 実際に有効な module 一覧
- httpd.conf や VirtualHost 設定
- Apache の手前に別の TLS terminator / reverse proxy がいるか
- /j/weeklyshonenjump/ が静的 file として返されているのか，backend application で生成されているのか

は直接確認していない．したがって，本章では外部から観測できた事実と，Apache を含む一般的な構成からの推測を分けて述べる．

まず，これまでの内容を思い返すと，Response Header に以下のように書かれていた．

```text
HTTP/2 200
server: Apache
content-type: text/html
```

また，TLS では以下が観察された．

- certificate subject: \*.shonenjump.com
- issuer: Let's Encrypt R13
- ALPN: h2

Apache が TLS 終端と HTTP/2 処理を直接担当している構成であれば，TLS には mod_ssl，HTTP/2 には mod_http2 が関与している可能性が高い．Apache の mod_ssl は TLS/SSL support を提供し，暗号処理には OpenSSL を用いる．また，mod_http2 は Apache HTTP Server に HTTP/2 support を提供し，h2 は TLS ALPN により negotiation できる．

Apache Module mod_ssl
https://httpd.apache.org/docs/current/mod/mod_ssl.html

Apache Module mod_http2
https://httpd.apache.org/docs/current/mod/mod_http2.html

ただし，前段に TLS terminator や reverse proxy が存在する場合，client から観測した TLS/HTTP/2 の処理が Apache 自身で行われているとは限らない．そのため，以下では Apache が直接 443 番 port を受けている場合の一例として整理する．

Apache が直接 443 番 port を受けている構成であれば，まず mod_ssl と OpenSSL が TLS handshake を処理する．この過程で，ClientHello の SNI や ALPN が解釈され，server certificate が提示され，TLSv1.3 の鍵交換が行われる．3章で見たように ALPN では h2 が選択されたため，TLS handshake 後の application data は HTTP/2 frame として扱われる．

次に，mod_http2 が HTTP/2 connection を扱う．client は connection preface，SETTINGS，WINDOW_UPDATE を送った後，GET /j/weeklyshonenjump/ を HEADERS frame として送信した．Apache 側では，この request が Apache 内部の request processing に渡される．

Request Processing in the Apache HTTP Server 2.x
https://httpd.apache.org/docs/current/developer/request.html

今回の観測では，最終的に HTTP/2 200，content-type: text/html が返ったことまでは分かるが，HTML が Apache から静的 file として返されたのか，reverse proxy 先の application で生成されたのかは断定できない．

以上より，今回の観測から確実に言えるのは，client は www.shonenjump.com に対して HTTP/2 over TLS で request を送り，server 側は server: Apache を返す構成で 200 OK の HTML response を返した，ということである．一方で，Apache の version，module，設定，前段 proxy の有無，backend 構成は外部からは確認できないため，本章では Apache を含む一般的な server 側処理として整理した．

## 8. まとめ

本回答では，https://www.shonenjump.com/j/weeklyshonenjump/ を Firefox の URL bar に入力して Enter key を押したときに何が起きるかを，実際の観測と実装の両面から追った．

まず，Developer Tools や各種コマンドを用いて，今回の環境で観測される通信の概要を確認した．
最初の request は GET /j/weeklyshonenjump/ であり，response は HTTP/2 200，server: Apache，content-type: text/html であった．TLS では TLSv1.3 が用いられ，cipher suite は TLS_AES_256_GCM_SHA384，key exchange group は x25519，certificate は \*.shonenjump.com に対する Let’s Encrypt R13 発行のものだった．
DNS では www.shonenjump.com の A record として 202.218.223.232 が返り，以降の通信はこの address に対して行われた．

次に，Wireshark を用いてパケット解析を行った．DNS では HTTPS，A，AAAA record の query が送られ，A record のみ 202.218.223.232 を返した．
その後，client は 202.218.223.232:443 に対して TCP 3-way handshake を行い，続いて TLSv1.3 handshake を行った．ClientHello では SNI，ALPN，supported_versions，key_share などが送られ，server 側は certificate を提示し，ALPN では h2 が選択された．
そのため，TLS handshake 後の application data は HTTP/2 frame として流れた．HTTP/2 では connection preface，SETTINGS，WINDOW_UPDATE の後，GET /j/weeklyshonenjump/ が HEADERS frame として送られ，server から 200 OK と HTML の DATA frame が返った．その後，CSS，JavaScript，画像などの追加 resource が別 stream で並列に取得された．

Firefox 内部の処理については，Firefox Profiler と Searchfox を用いて追った．URL bar で Enter key が押されると，UrlbarInput から URILoadingHelper，tabbrowser，RemoteWebNavigation へ処理が進む．この過程で，本体の document load だけでなく speculative connect も起動される．
speculative connect 側では，proxy 解決を経て nsHttpHandler / nsHttpConnectionMgr に処理が渡り，Socket Thread 上で DNS 解決，TCP connection，TLS handshake，HTTP/2 connection preface などが進む．
一方，本体の Channel Load 側では nsHttpChannel が作成され，nsHttpTransaction が nsHttpConnectionMgr に dispatch される．利用可能な HTTP/2 connection 上に stream が作成され，/j/weeklyshonenjump/ への request が HEADERS frame として送られる．

Response の受信側では，Socket Thread 上で HTTP/2 frame が処理され，nsHttpTransaction の pipe を通じて Main Thread 側の nsInputStreamPump / nsHttpChannel に渡る．
その後，DocumentLoadListener などを経由して Content Process 側で document の作成と HTML parsing が始まる．HTML の解析が進むにつれて，CSS，JavaScript，画像などの追加 resource load が発生し，Wireshark で見えた複数の HTTP/2 stream による並列 request につながる．

TCP については，Linux kernel の TCP 実装を追った．Client 側では，Firefox の connect syscall から kernel に入り，tcp_v4_connect で route lookup，TCP_SYN_SENT への状態遷移，ephemeral port の割り当て，SYN の送信が行われる．
SYN/ACK を受け取ると，tcp_rcv_synsent_state_process から tcp_finish_connect に進み，client socket は TCP_ESTABLISHED になる．
Server 側では，LISTEN socket が SYN を受けると request_sock を作って SYN/ACK を返し，最終 ACK を受け取ると pending request から child socket が作られ，その child socket が TCP_ESTABLISHED になる．
この TCP connection の上に，TLS record や HTTP/2 frame が byte stream として流れる．

ネットワーク経路については，VM 内の packet が Host macOS の仮想 network，家庭内 router，ISP/IX 付近の network を経由して 202.218.223.232 に届くまでを追った．
Wireshark や traceroute から，VM と Host の間には仮想 NIC や NAT が存在し，外部 network へ出る際に address/port の変換が行われていると考えられる．ただし，traceroute だけから経路上の L2 接続や peering の詳細までは断定できない．

Server 側については，response header の server: Apache を手がかりに，Apache HTTP Server を含む構成として整理した．ただし，server にログインしていないため，Apache の 詳細構成は確認できない．
Apache が直接 TLS 終端と HTTP/2 処理を担当している場合には，TLS には mod_ssl，HTTP/2 には mod_http2 が関与している可能性が高い．その場合，TLS handshake 後に h2 として HTTP/2 connection が扱われ，GET /j/weeklyshonenjump/ の request が Apache 内部の request processing に渡される．
最終的に今回の観測では，server: Apache header を含む 200 OK の HTML response が返った．


今回の解析では，すべての処理を完全に確認できたわけではない．特に，server 側の Apache 設定や backend 構成，TLS 終端の正確な位置，network 経路上の詳細な L2 接続などは外部からは確認できなかった．時間的制約で systemd-resolved の挙動，また Enter key が伝わるまでの QEMU や Wayland の挙動も追えていない．また，Firefox Profiler はサンプリングベースであるため，短時間で終わる処理は stack に現れないことがある．そのため，本回答では Wireshark，Developer Tools，Firefox Profiler，Searchfox，Linux kernel source，RFC document などを組み合わせ，可能な範囲で一連の流れを追跡した．
