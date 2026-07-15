# s-agent — AutoStoyanka Local Agent

Stoyanka kompyuterida ishlaydigan Node.js dastur. **Ikkita IP kamerani**
(Kirish va Chiqish) **parallel** kuzatadi, harakat (mashina) sezadi, avtomatik
rasm oladi, `s-backend` ga yuboradi va (ixtiyoriy) shlagbaumga signal beradi.

Harakat aniqlash **toza JavaScript** (`sharp`) orqali amalga oshiriladi — native
kompilyatsiya talab qiladigan OpenCV bog'liqligi yo'q, shu sabab `npm install`
har qanday kompyuterda tez va muammosiz ishlaydi.

## Markazlashtirilgan konfiguratsiya (backend'dan)

**Kamera URL'lari va shlagbaum sozlamalari endi `.env`da emas** — ular
`s-backend`dagi `GET /api/agent/config` orqali olinadi va **har 1 daqiqada
avtomatik yangilanadi**. Bu shuni anglatadiki: Super Admin web panelda
(masalan tarif/kamera/shlagbaum sozlamalarini) o'zgartirsa, s-agentni qayta
ishga tushirish shart emas — u o'zi bir daqiqa ichida yangi qiymatlarni oladi.

`.env`da faqat **local** (stoyanka kompyuteriga xos, backend bilishi shart
bo'lmagan) sozlamalar qoladi: server manzili, autentifikatsiya kaliti, kamera
login/parol va texnik parametrlar.

## Fayl strukturasi

```
s-agent/
├── src/
│   ├── camera.ts         — kameradan bitta JPEG kadr olish (snapshot ham, uzluksiz MJPEG stream ham — universal)
│   ├── motion.ts         — ikki kadrni grayscale piksel farqi orqali solishtirish (sharp, pure function)
│   ├── barrier.ts         — shlagbaum relay moduliga serialport orqali signal (port dinamik)
│   ├── server.ts          — s-backend bilan aloqa (POST /api/agent/parking/{entry|exit|verify}, /heartbeat)
│   ├── queueProcessor.ts  — offline navbatni (queue/) qayta ishlash
│   ├── configFetcher.ts   — GET /api/agent/config — backend'dan kamera/shlagbaum sozlamalarini oladi
│   ├── agentConfig.ts     — backend'dan kelgan sozlamalarning global (dinamik) holati
│   ├── liveView.ts        — Live View: Socket.IO orqali kamera oqimini backend'ga "quvur" kabi uzatish
│   ├── config.ts          — .env o'zgaruvchilarini o'qish va validatsiya (faqat LOCAL sozlamalar)
│   ├── errors.ts          — xatolarni logga yozish uchun o'qiladigan matnga aylantirish
│   ├── logger.ts           — console + kunlik rotatsiyalanadigan fayl (winston) logging
│   ├── lock.ts             — bitta nusxa kafolati (lock/agent.lock, PID tekshiruvi)
│   ├── agent.ts            — Kirish, Chiqish, Navbat, Konfiguratsiya, Heartbeat va Live View oqimlari (parallel)
│   └── index.ts            — kirish nuqtasi, uncaughtException/graceful shutdown
├── logs/            — ish vaqtidagi loglar (agent-YYYY-MM-DD.log, 14 kundan keyin avtomatik o'chadi)
├── lock/            — agent.lock (runtime, joriy jarayon PID'i, git'ga qo'shilmaydi)
├── queue/           — s-backend ga yuborib bo'lmagan so'rovlar (runtime, git'ga qo'shilmaydi)
│   └── failed/      — 5 marta urinishdan keyin ham yuborilmagan so'rovlar
├── .env             — mahalliy sozlamalar (git'ga qo'shilmaydi)
├── .env.example     — namuna sozlamalar
├── ecosystem.config.js — PM2 konfiguratsiyasi (avtomatik qayta ko'tarish)
├── package.json
├── tsconfig.json
└── README.md
```

## Talablar

- Node.js 18+
- Shlagbaum ulanadigan bo'lsa: USB yoki RS-485 relay modul (COM port /
  `/dev/ttyUSBx`) — `serialport` paketi buni boshqaradi.
- Qo'shimcha native build vositalari (Python, OpenCV va h.) **kerak emas** —
  `sharp` prebuilt binary bilan keladi.
- `s-backend`da `GET /api/agent/config` endpointi ishlashi kerak (allaqachon
  mavjud — `s-backend/src/modules/agent/agent.controller.ts` → `configHandler`).

## O'rnatish

```bash
cd s-agent
npm install
cp .env.example .env   # so'ng .env faylini o'z qiymatlaringiz bilan tahrirlang
```

`.env` qiymatlari (barchasi **local**, backend bilan bog'liq emas):

| O'zgaruvchi | Tavsif |
|---|---|
| `SERVER_URL` | s-backend manzili |
| `AGENT_API_KEY` | Local Agent ↔ server autentifikatsiya kaliti (`X-Agent-Key` header, muddatsiz — shu kalit backend tomonida qaysi tashkilotga (`org_id`) tegishli ekanini ham aniqlaydi) |
| `CAMERA_USERNAME` / `CAMERA_PASSWORD` | Kameraning HTTP Basic Auth login/paroli |
| `CAPTURE_INTERVAL_MS` | Kameradan necha millisoniyada bir kadr olinadi |
| `MOTION_THRESHOLD` | Harakat deb hisoblanadigan o'rtacha piksel farqi chegarasi |
| `BARRIER_CONFIDENCE_THRESHOLD` | Shlagbaumni ochish uchun talab qilinadigan OCR ishonch darajasi (0–1, standart `0.75`) — sessiya yozish uchun ishlatiladigan (backend ichidagi) umumiy chegaradan alohida va odatda undan yuqoriroq |

**Backend'dan keladigan** (`.env`da YO'Q) sozlamalar: `camera_entry_url`,
`camera_exit_url`, `barrier_enabled`, `barrier_mode` (`single`/`separate`),
`barrier_entry_port`, `barrier_exit_port`, `barrier_open_seconds` — bularni
Super Admin web panel orqali (stoyanka sozlamalarida) belgilaydi.

## Ishga tushirish

**Development rejimida** (tsx bilan, qayta kompilyatsiyasiz qayta yuklash):

```bash
npm run dev
```

**Production uchun** (build qilib, keyin ishga tushirish):

```bash
npm run build
npm start
```

## Avtostart va avtomatik qayta ko'tarilish (PM2)

Stoyanka kompyuteri qanday operatsion tizim ekani oldindan noma'lum bo'lgani
uchun, **PM2** ishlatiladi — u Windows, macOS va Linux'ning barchasida bir
xil ishlaydigan, universal Node.js process-menejeri. PM2 ikkita narsani
ta'minlaydi:

1. **Qulasa avtomatik qayta ko'tarish** — `s-agent` istalgan sababdan
   to'xtab qolsa (`kill -9`, kutilmagan xato, hatto operatsion tizim
   qulab tushib qayta yuklanishi), PM2 uni darhol qayta ishga tushiradi.
2. **Kompyuter qayta yuklanganda avtomatik ishga tushish** — bu qism
   operatsion tizimga qarab farq qiladi (pastga qarang).

Loyihada tayyor **`ecosystem.config.js`** fayli bor — barcha 3 platformada
bir xil ishlaydi, o'zgartirish shart emas.

### 1-qadam — barcha platformalarda umumiy

```bash
npm install -g pm2      # PM2'ni butun tizimga (global) o'rnatish
npm run build            # dist/ papkasini tayyorlash

pm2 start ecosystem.config.js   # s-agent'ni PM2 orqali ishga tushirish
pm2 save                        # joriy holatni saqlash (keyingi qadam uchun shart)
```

Foydali buyruqlar (`package.json` skriptlari orqali ham chaqirish mumkin):

```bash
npm run pm2:status     # holatni ko'rish
npm run pm2:logs       # jonli loglarni kuzatish
npm run pm2:restart    # qo'lda qayta ishga tushirish
npm run pm2:stop       # to'xtatish
```

### 2-qadam — kompyuter yuklanganda avtomatik ishga tushish (OS'ga qarab)

#### 🪟 Windows

PM2'ning o'zi Windows'da `pm2 startup` orqali ishlay olmaydi (bu faqat
systemd/launchd bor tizimlar uchun) — shuning uchun **`pm2-windows-startup`**
qo'shimcha paketi kerak:

```bash
npm install -g pm2-windows-startup
pm2-startup install
```

Shu bilan PM2'ning o'zi (demak `s-agent` ham) Windows yuklanganda fonda
avtomatik ishga tushadigan bo'ladi.

#### 🍎 macOS

```bash
pm2 startup
```

Bu buyruq ekranga `sudo env PATH=... pm2 startup launchd -u <foydalanuvchi> --hp <uy-papka>`
ko'rinishidagi buyruqni chiqaradi — **shu chiqqan buyruqni nusxalab, o'zingiz
ishga tushiring** (PM2 buni avtomatik bajarmaydi, chunki `sudo` kerak).
Bu — macOS'ning `launchd` tizimiga PM2'ni ro'yxatdan o'tkazadi.

#### 🐧 Linux

```bash
pm2 startup
```

Xuddi macOS'dagidek — ekranga chiqqan `sudo ...` buyrug'ini nusxalab ishga
tushiring. PM2 sizning distributivingizga mos init tizimini (odatda
`systemd`) avtomatik aniqlaydi va shunga mos buyruq beradi.

> **Eslatma:** `pm2 startup` buyrug'i har doim **sizning aniq
> foydalanuvchi nomingiz va operatsion tizimingizga mos** buyruq chiqaradi
> — shuning uchun bu README'da bitta qattiq kod o'rniga, "buyruqni ishga
> tushiring va PM2 sizga keyingi qadamni ko'rsatadi" tarzida yozilgan.

## Ishga tushish jarayoni (index.ts)

0. **`acquireLock()`** — hamma narsadan OLDIN: shu kompyuterda s-agentning
   boshqa nusxasi allaqachon ishlab turgan-turmaganini tekshiradi (pastga,
   "Bitta nusxa kafolati" bo'limiga qarang). Agar boshqa nusxa jonli bo'lsa —
   backend'ga so'rov yuborilmasdanoq, darhol `process.exit(1)`.
1. **`fetchAgentConfig()`** — backend'dan kamera/shlagbaum sozlamalarini olishga
   bir marta harakat qiladi (`updateAgentConfig()` orqali global holatga
   yoziladi va konsolda `"Konfiguratsiya backend dan olindi: ..."` logi
   chiqadi). Muvaffaqiyatsiz bo'lsa — dastur **to'xtamaydi**, xato logga
   yoziladi, keyingi qadamga o'tiladi (config keyinroq, davriy yangilashda
   olinadi).
2. **`processQueue()`** — agent o'chirilgan paytda navbatda qolgan so'rovlar
   bo'lsa, ularni bir marta qayta yuborishga harakat qiladi.
3. **`startAgent()`** — to'rtta mustaqil oqimni (`Promise.all`) ishga
   tushiradi: Kirish, Chiqish, Navbat, Konfiguratsiya.

## Bitta nusxa kafolati (`lock/agent.lock`)

s-agent shu kompyuterda **tasodifan ikki marta** ishga tushirilishining
oldini oladi — masalan, texnik xodim TeamViewer orqali qo'lda qayta ishga
tushirmoqchi bo'lsa, lekin eski nusxa PM2 orqali fonda allaqachon ishlab
turgan bo'lsa. Ikkita nusxa bir vaqtda bitta kameraga ulanishi chalkashlik
va xatolarga olib kelishi mumkin — shuni oldini olish uchun (`lock.ts`):

1. **Ishga tushganda** (`index.ts` eng boshida, backend'ga birinchi so'rov
   yuborishdan OLDIN) — `lock/agent.lock` fayli bor-yo'qligi tekshiriladi:
   - **Fayl bor va undagi PID hali jonli** (`process.kill(pid, 0)` — signal
     yubormasdan, faqat jarayon mavjudligini tekshiradi) → aniq xato bilan
     darhol to'xtaydi: `"s-agent ALLAQACHON ishlab turibdi (PID: X)"`,
     `process.exit(1)`.
   - **Fayl bor, lekin undagi PID endi jonli emas** (masalan avvalgi
     nusxa kutilmagan tarzda qulagan — "eskirgan" lock) → buni aniq log
     bilan bildirib (`"Eskirgan lock fayl topildi..."`), eski faylni
     almashtirib, **oddiy davom etadi**.
   - **Fayl umuman yo'q** → joriy PID bilan yangi lock fayl yoziladi.
2. **To'xtaganda** — graceful shutdown (`SIGINT`/`SIGTERM`) paytida ham,
   kutilmagan xato (`uncaughtException`/`unhandledRejection`/fatal xato)
   paytida ham, `releaseLock()` chaqirilib, lock fayl o'chiriladi — lekin
   **faqat agar u haqiqatan ham shu jarayonning o'zi tomonidan yozilgan
   bo'lsa** (fayldagi PID joriy PID bilan solishtiriladi), boshqa (yangiroq)
   nusxaning lockini bexosdan bosib ketmaslik uchun.

> Agar dastur kutilmagan tarzda qulab, lock faylni o'chirib ulgurmasa —
> muammo emas: keyingi ishga tushirishda bu "eskirgan lock" sifatida
> to'g'ri aniqlanadi (1-band, 2-holat) va avtomatik almashtiriladi.

## Kutilmagan xatolar va graceful shutdown

`index.ts` quyidagi holatlarni alohida boshqaradi:

- **`uncaughtException`** — hech qachon ushlanmagan sinxron xato. Node'ning
  o'z tavsiyasiga ko'ra, bunday holatda dasturni "davom ettirishga" urinish
  xavfli (jarayon noaniq holatda qolgan bo'lishi mumkin) — shu sabab bu
  yerda hech qanday tozalash urinilmaydi: xato aniq loglanadi
  (`"KUTILMAGAN XATO: ..."`) va **darhol** `process.exit(1)` chaqiriladi.
- **`unhandledRejection`** — hech kim `.catch()` qilmagan rad etilgan
  Promise. Xuddi yuqoridagidek: loglanadi (`"ISHLANMAGAN PROMISE
  XATOSI: ..."`) va `process.exit(1)`.
- Ikkalasida ham jarayon o'zi qayta ko'tarilmaydi — buni **PM2** qiladi
  (yuqoridagi "Avtostart va avtomatik qayta ko'tarilish" bo'limiga qarang).
  Qayta ko'tarilganda `index.ts` har doim ishga tushish jarayonini
  boshidan boshlaydi — konfiguratsiya backend'dan **qaytadan** olinadi.

**`SIGINT`/`SIGTERM`** kelganda esa (masalan `pm2 stop`, `pm2 restart`, yoki
operatsion tizim o'chirilishi) — bular haqiqiy "graceful shutdown"
so'rovlari, shu sabab boshqacha ishlanadi:

1. `stopAgent()` chaqiriladi — bu barcha to'rtta oqimni (Kirish, Chiqish,
   Navbat, Konfiguratsiya) va Live View'ni to'xtatishga signal beradi.
2. **Barcha hozir kutayotgan ichki `sleep()` chaqiruvlari darhol
   uyg'onadi** (`agent.ts` dagi `shutdownEmitter` orqali) — aks holda
   `watchConfig` (60s) yoki `watchQueue` (30s) kabi oqimlar shutdown
   paytida hali ham uzoq vaqt "uxlab" yotgan bo'lardi va graceful
   shutdown haqiqatda tez bo'lmasdi.
3. Barcha oqimlar toza tugashini kutamiz (odatda 2-3 soniya — faqat
   `camera.ts`ning o'z 5 soniyalik qattiq timeout'i bilan chegaralangan,
   agar aynan shu paytda kameraga so'rov ishlab turgan bo'lsa), lekin
   **abadiy kutib qolmaslik uchun 8 soniyalik xavfsizlik chegarasi** bilan
   (`SHUTDOWN_SAFETY_TIMEOUT_MS`).
4. Toza tugagach (yoki xavfsizlik chegarasi ishga tushsa) —
   `process.exit(0)`.

> **PM2 bilan mos kelishi:** PM2'ning standart `kill_timeout` (1.6s) bu
> jarayon uchun juda qisqa bo'lardi — `ecosystem.config.js`da
> `kill_timeout: 10000` ga oshirilgan, shunda PM2 bizni yarim yo'lda
> majburan (`SIGKILL`) o'ldirib qo'ymaydi.

## Log rotatsiyasi

`logger.ts` endi **winston** + **winston-daily-rotate-file** orqali
ishlaydi (avval oddiy `fs.appendFile` bilan bitta cheksiz o'sadigan
`logs/agent.log` fayliga yozilardi):

- Har kuni **yangi fayl**: `logs/agent-2026-07-14.log`, ertasiga
  `logs/agent-2026-07-15.log` va h.k.
- **14 kundan eski fayllar avtomatik o'chiriladi** (`maxFiles: '14d'`).
- Oraliq (joriy bo'lmagan) fayllar avtomatik `.gz` qilib siqiladi
  (`zippedArchive: true`) — disk joyini tejash uchun.
- Log qatori formati **o'zgarmadi**: `[ISO vaqt] [DARAJA] xabar` — konsolga
  ham, faylga ham bir xil ko'rinishda yoziladi.

## Ishlash mantig'i

Kirish va Chiqish kameralari **ikkita mustaqil oqim** (`watchEntry` /
`watchExit`, `agent.ts`) sifatida bir vaqtda ishga tushiriladi. Har biri o'z
`previousFrame` holatini alohida saqlaydi (`motion.ts` pure function — holatni
o'zida saqlamaydi), shu sababli ikkala oqim bir-biriga xalaqit bermaydi. Kamera
URL va shlagbaum sozlamalari **har tickda** global (backend'dan kelgan)
konfiguratsiyadan qayta o'qiladi — shu sabab web panelda qilingan o'zgarish
keyingi tsikldayoq (eng ko'pi bilan 1 daqiqadan so'ng) ishlatila boshlaydi.

Har ikkala oqim ham quyidagi mantiqni bajaradi:

1. Kameradan kadr olinadi va oldingi kadr bilan solishtiriladi: ikkalasi ham
   `sharp` orqali grayscale + 320x240 ga kichraytiriladi (`raw` piksel
   massivi), so'ng piksel-piksel farqning o'rtachasi (`avgDiff`) hisoblanadi.
2. `avgDiff > MOTION_THRESHOLD` bo'lsa — harakat aniqlandi (`"Kirish: ..."`
   yoki `"Chiqish: ..."` prefiksi bilan logga yoziladi):
   - 2 soniya kutiladi (mashina to'xtamaguncha),
   - yangi rasm olinadi (kamera URL yana eng oxirgi konfiguratsiyadan
     o'qiladi),
   - `POST {SERVER_URL}/api/agent/parking/entry` (yoki `.../exit`) ga
     `multipart/form-data` (`image`, `captured_at`) va
     `X-Agent-Key: {AGENT_API_KEY}` header bilan yuboriladi.
3. Javob `{ detected, confidence, session: { plate_number } }` shaklida qaytadi:
   - `detected: true` → nomer (`session.plate_number`) logga yoziladi, sessiya
     bazaga **allaqachon yozilgan** (backend tomonidan). Shlagbaumni ochish
     qarori esa quyidagi "Shlagbaumni ochishdan oldingi ikki bosqichli himoya"
     mantig'iga o'tadi — sessiya yozilishi bilan bog'liq emas.
   - `detected: false` → operator server tomonidan xabardor qilinadi
     (WebSocket/polling — bu `s-backend` va frontend tomonida amalga
     oshiriladi).
4. Harakatdan keyin 5 soniya "sovish" pauzasi qo'yiladi — bitta mashina uchun
   qayta-qayta ishga tushmasligi uchun.

## Kameradan kadr olish — universal (`camera.ts`)

`captureFrame()` javobni **stream** sifatida ochadi va kelayotgan baytlar
ichidan birinchi to'liq JPEG kadrni (`0xFFD8` SOI ... `0xFFD9` EOI markerlari
orqali) topgan zahoti ulanishni **darhol** yopadi — javobning o'z-o'zidan
tugashini kutmaydi. Shu sabab bir xil `captureFrame()` ikkalasi bilan ham
bab-baravar ishlaydi:

- oddiy bitta-rasmli endpoint (masalan `/snapshot.jpg`) — javob baribir tez
  tugaydi, farqi yo'q;
- hech qachon o'z-o'zidan tugamaydigan uzluksiz MJPEG stream (masalan
  `/video`) — bunday holatda multipart chegara (boundary) formatini bilish
  yoki taxmin qilish shart emas, chunki JPEG bayt markerlarining o'zi
  ko'rsatkich vazifasini bajaradi.

Bu — Live View bilan **bitta xil** kamera URL'ni ishlatish imkonini beradi:
avval `camera_entry_url`/`camera_exit_url` ikkita turli maqsad (oddiy kadr
olish va uzluksiz Live View) uchun ziddiyatli edi (biriga mos URL
ikkinchisini buzardi) — endi ikkalasi ham bir xil `/video` (yoki xohlasa
`/snapshot.jpg`) bilan muammosiz ishlaydi, alohida backend maydoni yoki
qo'lda URL almashtirish shart emas.

Qattiq (wall-clock) 5 soniyalik `AbortController` timeout ham saqlanadi —
agar hech qachon to'liq JPEG kadr yig'ilmasa (kamera butunlay javob bermasa),
so'rov abadiy osilib qolmaydi.

## Shlagbaumni ochishdan oldingi ikki bosqichli himoya

OCR modeli tasodifiy xato bilan noto'g'ri narsani (devordagi yozuv, reklama)
"nomer" deb aniqlab, shlagbaumni keraksiz ochib yubormasligi uchun,
**sessiya bazaga yozilishi bilan shlagbaum ochilishi endi ajratilgan**:
sessiya har doim `detected: true` bo'lganda yoziladi (o'zgarmadi), lekin
shlagbaum quyidagi ikkala shartni ham qanoatlantirgandagina ochiladi
(`confirmAndOpenBarrier()`, `agent.ts`):

1. **Yuqoriroq ishonch chegarasi:** birinchi kadrning `confidence`si
   `BARRIER_CONFIDENCE_THRESHOLD` (standart `0.75`) dan past bo'lsa —
   shlagbaum **umuman urinilmaydi** (ikkinchi tekshiruv ham o'tkazilmaydi).
   Log: `"ishonch darajasi past (0.60 < 0.75) — shlagbaum ochilmadi, sessiya
   baribir yozildi"`.
2. **Ketma-ket 2 marta mustaqil tasdiqlash:** birinchi kadr yetarli ishonchli
   bo'lsa ham, ~1 soniyadan keyin **yana bitta** mustaqil kadr olinadi va
   `POST /api/agent/parking/verify` ga yuboriladi — bu endpoint **sessiya
   yaratmaydi, bazaga yozmaydi**, faqat OCR natijasini (`{ plate, confidence }`)
   qaytaradi. Faqat ikkala kadr ham **bir xil nomer**ni va
   `BARRIER_CONFIDENCE_THRESHOLD`dan yuqori ishonchni bersa — shlagbaum
   ochiladi. Mos kelmasa: log `"ikkinchi tasdiqlash mos kelmadi (1-nomer=...,
   2-nomer=..., ishonch=...) — shlagbaum ochilmadi"`.

**Muhim:** bu ikkinchi tekshiruv backend'ga yuborilayotgan asosiy entry/exit
so'rovi (nomer + rasm + sessiya yozuvi) sonini **oshirmaydi** — u faqat
lokal, qo'shimcha `/verify` so'rovi, natijasi faqat shlagbaum qaroriga
ta'sir qiladi. `s-python` (OCR modeli) ga to'g'ridan-to'g'ri murojaat
qilinmaydi — xavfsizlik va tarmoq sabablariga ko'ra (`s-python:/detect`
autentifikatsiyasiz va faqat backend serverining o'zida ishlaydi), buning
o'rniga `s-backend`dagi yangi, `X-Agent-Key` bilan himoyalangan
`POST /api/agent/parking/verify` orqali (ichkarida xuddi shu `detectPlate()`
ni chaqiradi).

Ikkinchi tekshiruv paytida kamera yoki server bilan xato yuz bersa (masalan
tarmoq uzilishi) — fail-closed: shlagbaum **ochilmaydi**, xato logga yoziladi,
lekin dastur davom etadi (sessiya allaqachon yozilgan bo'lgani uchun hech
narsa yo'qolmaydi).

> **`MOTION_THRESHOLD` haqida:** `avgDiff` — bu piksel boshiga o'rtacha farq
> va 0–255 oralig'ida bo'ladi (OpenCV'dagi butun kadr bo'yicha yig'indidan
> farqli). Standart qiymat (`.env.example` da `20`) odatiy fon shovqinidan
> (real testda o'lchangan qiymat: ~3–4) sezilarli yuqori, lekin haqiqiy
> kamera joylashuvi/yorug'lik sharoitiga qarab **10–30** oralig'ida
> kalibrlashni tavsiya qilaman.

## Dinamik konfiguratsiya (watchConfig)

`watchConfig()` (`agent.ts`) — qolgan uch oqimdan mustaqil to'rtinchi oqim:
har 60 soniyada `fetchAgentConfig()` ni qayta chaqiradi va natijani
`updateAgentConfig()` orqali global holatga yozadi. Har muvaffaqiyatli
yangilanishda konsolda joriy qiymatlar bilan log chiqadi, masalan:

```
[INFO] Konfiguratsiya backend dan olindi: Kirish kamerasi=http://192.168.0.120:8081/snapshot.jpg, Chiqish kamerasi=..., Shlagbaum=yoqilgan (mode=separate, entry_port=COM7, exit_port=COM8, 9s)
```

Agar backend'dan konfiguratsiya olishda xato bo'lsa (server o'chgan,
tarmoq muammosi) — **eski konfiguratsiya bilan davom etiladi**, dastur
to'xtamaydi, xato aniq logga yoziladi.

Agar hali hech qachon konfiguratsiya muvaffaqiyatli yuklanmagan bo'lsa
(masalan startup'da backend javob bermagan), Kirish/Chiqish oqimlari har 5
soniyada `"kamera URL hali backend'da sozlanmagan"` yoki
`"Agent konfiguratsiyasi hali backend'dan yuklanmagan"` xatosini qaytarib
turadi — bu ham normal holat, `watchConfig` muvaffaqiyatli ishlagach avtomatik
tuzaladi.

## Heartbeat ("men tirikman" signali)

`watchHeartbeat()` (`agent.ts`) — qolgan oqimlardan mustaqil beshinchi oqim:
ishga tushgan zahoti va shundan keyin har **30 soniyada** bir marta,
`POST {SERVER_URL}/api/agent/heartbeat` ga (`X-Agent-Key` bilan, bo'sh
body) juda kichik, tez so'rov yuboradi. Backend bu so'rovni olganda
`tb_settings.last_heartbeat_at` ustunini yangilaydi (`recordHeartbeat()`,
`s-backend`) — shu orqali operator/Super Admin panelda ushbu ustunning
qanchalik "eskirganiga" qarab s-agent oflayn bo'lib qolganini bilish
mumkin bo'ladi.

Heartbeat so'rovi muvaffaqiyatsiz bo'lsa (server javob bermasa, tarmoq
uzilsa) — bu **hech qanday boshqa funksional oqimga ta'sir qilmaydi**:
xato faqat `"Heartbeat yuborishda xato: ..."` deb ogohlantirish (`WARN`)
sifatida logga yoziladi, oqim davom etadi va 30 soniyadan keyin qayta
urinadi. Navbat (queue) mantig'iga bog'liq emas — heartbeat'ning o'zi
takrorlanuvchi bo'lgani uchun muvaffaqiyatsiz urinishni alohida
saqlab qo'yishning hojati yo'q.

## Live View (kamera oqimini operatorga uzatish)

Operator Dashboard'dagi jonli kamera ko'rinishi shu arxitektura orqali ishlaydi:

```
Operator brauzeri → s-backend (HTTP, GET /api/live-view) → Socket.IO → s-agent → HTTP GET → Kamera
```

`s-backend` kameraga hech qachon to'g'ridan-to'g'ri ulanmaydi — buni faqat
`s-agent` qiladi (chunki u kamera bilan bir xil local tarmoqda). `s-agent`
kameradan kelayotgan xom baytlarni **hech qanday parsing/qayta kodlashsiz**
Socket.IO orqali backendga "quvur" kabi uzatadi (`liveView.ts`).

> **Eslatma:** bu funksiyaning `s-backend` tomoni (`socketServer.ts`,
> `liveViewRelay.ts`, `GET /api/live-view`, kamera login/parolini shifrlab
> saqlash) **avvaldan tayyor va sinovdan o'tgan edi** — shu safar men faqat
> `s-agent` tomonini (`liveView.ts`) qurdim va uni mavjud backend bilan
> real ravishda ulab sinadim.

1. **Ulanish:** ishga tushganda `startAgent()` (`agent.ts`) bitta marta
   `startLiveView()` ni chaqiradi — bu boshqa to'rtta oqimdan (Kirish,
   Chiqish, Navbat, Konfiguratsiya) mustaqil, o'zining voqea-asosidagi
   (event-driven) Socket.IO ulanishi. Autentifikatsiya HTTP header emas,
   handshake `auth` obyekti orqali: `{ auth: { agentKey: AGENT_API_KEY } }`.
2. **`live_view:start` ({ type })** — backend'dan kelganda: joriy
   konfiguratsiyadan (`agentConfig.ts`) tegishli kamera URL va login/parolni
   olib, kameraga `responseType: 'stream'` bilan ulanadi.
   - Muvaffaqiyatli ulangach, **birinchi chunk'dan oldin** darhol
     `live_view:started({ type, content_type })` yuboriladi — backend buni
     10 soniya ichida kutmasa, tomoshabinlarga 502 qaytaradi.
   - Har bir kelgan baytlar bo'lagi o'zgarishsiz `live_view:chunk({ type, chunk })`
     sifatida uzatiladi.
   - Kameraga ulanib bo'lmasa yoki oqim keyinroq uzilib qolsa —
     `live_view:error({ type, message })`.
3. **`live_view:stop` ({ type })** — kameraga ochilgan HTTP ulanish
   (`AbortController` orqali) yopiladi. Agar shu turdagi faol oqim
   bo'lmasa — jim o'tkazib yuboriladi.
4. **Bir xil turga takroriy `live_view:start`** (masalan ikkinchi
   tomoshabin) — backend buni allaqachon safarbar qiladi (bitta org+type
   uchun faqat bitta `start` yuboradi, ko'p tomoshabinni o'zi ichida
   ko'paytiradi), lekin `s-agent` ham himoyalangan: agar shu tur uchun
   allaqachon faol oqim bo'lsa, takroriy `start` shunchaki e'tiborsiz
   qoldiriladi (ikkinchi marta kameraga ulanilmaydi).
5. **Kirish va Chiqish mustaqil:** har biri o'zining alohida HTTP
   ulanishini saqlaydi (`Map<'entry'|'exit', ...>`) — biri to'xtasa yoki
   xato bersa, ikkinchisiga ta'sir qilmaydi.
6. **Socket.IO uzilsa:** backend o'z tomonidan barcha tomoshabinlarni
   yakunlaydi — `s-agent` hech narsa qilishi shart emas, lekin xotira
   sizib chiqmasligi uchun **o'zining** ochiq kamera HTTP ulanishlarini
   ham darhol yopadi (`stopAllStreams()`, `disconnect` hodisasida).

> **Kamera login/paroli endi ham backend'dan:** `agentConfig.ts`dagi
> `resolveCameraAuth()` avval backend'da (shifrlangan holda) sozlangan
> `camera_username`/`camera_password`ni ishlatadi, faqat sozlanmagan bo'lsa
> `.env`dagi `CAMERA_USERNAME`/`CAMERA_PASSWORD` local fallback sifatida
> ishlatiladi. Bu — oddiy kadr olish (`captureFrame`) va Live View uchun bir
> xil, yagona manba.

## Offline navbat (queue)

Internet yoki `s-backend` vaqtincha ishlamasa, rasm **yo'qolmaydi** —
`queue/` papkasiga JSON fayl sifatida saqlanadi va keyinroq avtomatik qayta
yuboriladi:

1. `sendToServer()` (`server.ts`) so'rov muvaffaqiyatsiz bo'lganda xato turini
   tekshiradi:
   - **Tarmoq xatosi / timeout / 5xx** (vaqtinchalik muammo) → rasm
     `queue/<epochMs>-<uuid>.json` sifatida saqlanadi (`type`, base64 rasm,
     `capturedAt`, `attempts: 0`), funksiya `{ detected: false, queued: true }`
     qaytaradi.
   - **401/409 kabi 4xx xato** (qayta urinish yordam bermaydi — masalan token
     yaroqsiz) → navbatga saqlanmaydi, oddiy xato sifatida logga yoziladi.
2. **`watchQueue()`** (`agent.ts`) — har 30 soniyada `queue/` hajmini
   tekshiradi; bo'sh bo'lmasa `processQueue()` ni chaqiradi.
3. **`processQueue()`** (`queueProcessor.ts`) — navbatdagi fayllarni eng
   eskisidan boshlab ketma-ket qayta yuboradi:
   - muvaffaqiyatli bo'lsa — fayl darhol o'chiriladi,
   - muvaffaqiyatsiz bo'lsa — `attempts` oshirilib fayl saqlanadi,
   - `attempts >= 5` bo'lsa — fayl `queue/failed/`ga ko'chiriladi (butunlay
     yo'qotilmaydi, lekin cheksiz urinish ham to'xtaydi).
4. **Dastur ishga tushganda** (`index.ts`) — asosiy oqimlar boshlanishidan
   oldin `processQueue()` bir marta chaqiriladi.

> **`captured_at`:** har bir `POST /api/agent/parking/{entry|exit}` so'roviga
> `multipart/form-data` maydoni sifatida `captured_at` (ISO 8601, rasm olingan
> payt) qo'shib yuboriladi — navbatga tushib kechikib yuborilgan so'rovlarda
> ham `entered_at`/`exited_at` haqiqiy vaqtga mos bo'lishi uchun.
> `s-backend`da bu maydon allaqachon qabul qilinadi
> (`agent.controller.ts` → `entryHandler`/`exitHandler` → `req.body?.captured_at`).

## Xatolarga chidamlilik

- **Kamera/internet uzilsa yoki har qanday kutilmagan xato bo'lsa:** tegishli
  oqim (Kirish yoki Chiqish, `agent.ts`) buni ushlab, logga yozadi va 5
  soniyadan so'ng qayta urinadi — boshqa oqimlarga ta'sir qilmaydi, dastur
  to'xtamaydi.
- **s-backend javob bermasa (tarmoq/5xx):** rasm yo'qolmaydi — yuqoridagi
  "Offline navbat" bo'limiga qarang.
- **s-backend 401/409 kabi "kutilgan" xato qaytarsa:** navbatga saqlanmaydi,
  operator "Nomer aniqlanmadi" holatida xabardor qilinadi, sikl davom etadi.
- **Backend'dan konfiguratsiya olib bo'lmasa:** eski (oxirgi muvaffaqiyatli)
  konfiguratsiya bilan davom etiladi; hali umuman konfiguratsiya bo'lmasa —
  Kirish/Chiqish oqimlari buni aniq log bilan bildirib, avtomatik qayta
  urinaveradi.
- **Shlagbaum ulanmagan/xato bo'lsa:** signal yuborilmaydi, log yoziladi,
  qolgan jarayon davom etadi.
- **Butun `s-agent` jarayoni qulab tushsa** (masalan kutilmagan xato,
  `kill -9`, yoki kompyuter qayta yuklanishi): PM2 uni avtomatik qayta
  ishga tushiradi (yuqoridagi "Avtostart va avtomatik qayta ko'tarilish"
  bo'limiga qarang) — qayta ko'tarilganda `index.ts` har doim konfiguratsiyani
  backend'dan **qaytadan** oladi, hech qanday eski/keshlangan holatga
  tayanmaydi.
- Barcha xatolar konsolga **va** `logs/agent.log` fayliga yoziladi —
  `errors.ts` dagi `describeError()` orqali (Node'ning "localhost"ga
  ulanishda ikkala IPv4/IPv6 ham rad etilgan holatlarida xato `.message`si
  bo'sh `AggregateError` bo'lib qolishining oldini oladi).

## Test qilingani

Ushbu kompyuterda (haqiqiy `s-backend` va MySQL bazasi bilan, real
`GET /api/agent/config` orqali):

- **Heartbeat (`POST /api/agent/heartbeat`):** haqiqiy backend bilan —
  `curl` orqali to'g'ridan-to'g'ri chaqirilib, `tb_settings.last_heartbeat_at`
  ustuni haqiqatan yangilanishi tasdiqlandi (`200 {"ok":true}`). So'ng real
  `s-agent` ishga tushirilib (35 soniya), heartbeat oqimi xatosiz ishlagani
  va bazadagi vaqt yangilangani tasdiqlandi. Keyin **noto'g'ri `SERVER_URL`**
  bilan qayta sinaldi: `"Heartbeat yuborishda xato: ECONNREFUSED"` faqat
  ogohlantirish (`WARN`) sifatida logga yozildi, boshqa barcha oqimlar
  (Kirish/Chiqish/Navbat/Konfiguratsiya/Live View) o'zlarining mustaqil
  xatolarini alohida qayta urinishda davom etdi — heartbeat xatosi
  ularning birortasini ham to'xtatmadi. Graceful shutdown ham heartbeat
  oqimini to'g'ri to'xtatdi (`"Heartbeat kuzatuvi to'xtatildi"`).
- **Bitta nusxa kafolati (`lock/agent.lock`):** real ikkita alohida jarayon
  bilan sinaldi (birinchisi ishga tushirilib, ustiga ikkinchisi):
  - 1-nusxa ishlab turganda 2-nusxa ishga tushirilganda — **darhol**
    (backend'ga so'rov yuborilmasdanoq) `"s-agent ALLAQACHON ishlab
    turibdi (PID: ...)"` deb `exit code 1` bilan to'xtadi,
  - 1-nusxa `SIGTERM` bilan to'xtatilgach, `lock/` papka **bo'shab qoldi**
    (lock fayl to'g'ri o'chirildi), va shundan keyin yangi (2-) nusxa
    **muvaffaqiyatli** ishga tushdi, o'z PID'ini yangi lock faylga yozdi,
  - **eskirgan lock** holati sinaldi: mavjud bo'lmagan PID (`999999`) bilan
    qo'lda lock fayl yaratilib, s-agent ishga tushirildi — buni to'g'ri
    `"Eskirgan lock fayl topildi (PID: 999999 — jarayon mavjud emas),
    almashtirilmoqda"` deb aniqlab, **muvaffaqiyatli davom etdi** va yangi
    lock faylni o'z PID'i bilan yozdi.
- **PM2 orqali avtomatik qayta ko'tarilish (macOS'da sinaldi):** haqiqiy
  `s-backend` ishlab turgan holda `pm2 start ecosystem.config.js` bilan
  ishga tushirilib, keyin ishlab turgan jarayon **`kill -9`** bilan
  majburan o'ldirildi:
  - PM2 ~3-4 soniyadan so'ng (`exp_backoff_restart_delay`) uni **yangi
    PID** bilan avtomatik qayta ko'tardi (`restart_time` 0 → 1),
  - yangi jarayonning ilk loglari eskisi bilan **so'zma-so'z bir xil**
    ketma-ketlikni ko'rsatdi: `"Konfiguratsiya backend dan olindi: ..."`
    (kamera URL, shlagbaum sozlamalari) → `"AutoStoyanka Local Agent ishga
    tushdi"` → `"Live view: Socket.IO ulanishi o'rnatildi"` — ya'ni
    konfiguratsiya va Live View ulanishi **hech qanday eski holatga
    tayanmasdan, to'liq qaytadan** tiklandi,
  - `pm2 startup` buyrug'i macOS'da to'g'ri `launchd` tizimini aniqlab,
    kerakli `sudo` buyrug'ini chiqarishi ham tasdiqlandi (buyruqning o'zi
    ishga tushirilmadi — bu operatorning o'zi bajarishi kerak bo'lgan
    bir martalik sozlash qadami).
  - Windows uchun `pm2-windows-startup` paketi mavjudligi va aniq
    buyruqlari (`pm2-startup install`) npm registridan tasdiqlandi — lekin
    Windows'ning o'zida jismoniy test o'tkazilmadi (bu kompyuter macOS).
- **`uncaughtException` → PM2 avtomatik qayta ko'tarish (macOS'da,
  haqiqiy PM2 bilan):** vaqtinchalik sun'iy xato (`throw new Error(...)`)
  qo'shib, PM2 orqali ishga tushirildi. Har 2 soniyada xato chiqib turdi —
  har safar:
  - `"KUTILMAGAN XATO: ..."` aniq loglandi va jarayon darhol chiqib ketdi,
  - PM2 uni **avtomatik** qayta ko'tardi (`restart_time` ketma-ket oshib
    bordi: 0→5+), **hech qachon "voz kechmadi"**,
  - **har safar** konfiguratsiya backend'dan qaytadan olindi (loglarda
    har bir qayta ko'tarilishda `"Konfiguratsiya backend dan olindi: ..."`
    qaytarilib turdi),
  - `exp_backoff_restart_delay` ishlashi ham vaqt farqlaridan tasdiqlandi:
    ketma-ket qulashlar orasidagi kutish 9s → 12s → 17s ga oshib bordi
    (eksponensial backoff, CPU'ni band qilmaslik uchun).
  - Test kodi keyin butunlay olib tashlandi.
- **Graceful shutdown vaqti (SIGINT va SIGTERM, alohida-alohida sinaldi):**
  ishlab turgan real jarayonga `kill -TERM` va alohida `kill -INT`
  yuborilib, aniq vaqt tamg'alari bilan o'lchandi:
  - `watchQueue`/`watchConfig` — shutdown signalidan **millisekundlar
    ichida** to'xtadi (avval bu 30-60 soniyagacha cho'zilishi mumkin edi —
    interruptible `sleep()` tuzatilgandan keyin),
  - butun jarayon **~2-3 soniyada** toza tugadi (`"Local Agent to'xtadi"`),
    faqat o'sha payt kamerada ishlab turgan `captureFrame()`ning o'z ichki
    5 soniyalik qattiq timeout'ini kutib — bu 8 soniyalik xavfsizlik
    chegarasidan ancha tezroq, ya'ni "toza" yo'l orqali tugadi, xavfsizlik
    chegarasiga tayanmadi.
  - Test paytida bitta nozik xato ham topilib tuzatildi: agar `sleep()`
    chaqiruvi shutdown signali berilgandan **keyin** boshlangan bo'lsa
    (masalan xato-blokidagi kutish), u eski "bir martalik" hodisani
    ushlab qololmay, to'liq muddatni kutib qolardi — endi `sleep()`
    boshida `running` bayrog'i tekshiriladi va darhol qaytadi.
- **Log rotatsiyasi:** ishga tushirilib, `logs/agent-2026-07-14.log`
  (joriy kun sanasi bilan) to'g'ri yaratilgani va formatning
  (`[ISO vaqt] [DARAJA] xabar`) o'zgarmaganligi tasdiqlandi.
- **Kameradan kadr olish (`captureFrame`), universal:** haqiqiy kameraning
  uzluksiz MJPEG stream endpointi (`/video`) ustida to'g'ridan-to'g'ri
  (Live View'siz, alohida) sinaldi — 4 marta ketma-ket, har safar 0.5–2s
  ichida to'g'ri JPEG (SOI/EOI markerlari mos) qaytardi. So'ng soxta MJPEG
  kamera bilan **captureFrame() va uzluksiz Live View tomoshabinini bir xil
  kamera URL'iga BIR VAQTDA** ulab sinaldi: Live View 3 soniya davomida
  uzluksiz oqim oldi, shu bilan bir vaqtda captureFrame() 3 marta muvaffaqiyatli
  alohida kadr oldi — hech qanday to'qnashuvsiz (kamerada bir vaqtning o'zida
  2 ta mustaqil ulanish kuzatildi).
- **Konfiguratsiya yuklash:** ishga tushganda konsolda
  `"Konfiguratsiya backend dan olindi: ..."` logi chiqishi tasdiqlandi.
- **Dinamik yangilanish:** ishlab turgan agent davomida bazadagi
  `camera_entry_url`, `barrier_enabled`, `barrier_mode`,
  `barrier_entry_port`/`barrier_exit_port`, `barrier_open_seconds`
  o'zgartirildi — aynan 60 soniyadan so'ng agent yangi qiymatlarni avtomatik
  logda ko'rsatdi (qayta ishga tushirishsiz).
- **Backend butunlay ishlamasa:** `SERVER_URL` noto'g'ri portga
  yo'naltirilganda, ishga tushishdagi konfiguratsiya so'rovi xato bilan
  tugadi, lekin dastur yiqilmadi — Kirish/Chiqish oqimlari "konfiguratsiya
  hali yuklanmagan" xatosini har 5 soniyada logga yozib, kutishda davom etdi.
- **Offline navbat:** mock server bilan — server o'chirilganda saqlash,
  qayta yoqilganda muvaffaqiyatli qayta yuborish va o'chirish, 401'da
  saqlanmaslik, doimiy 5xx holatida 5 urinishdan keyin `failed/`ga ko'chishi.
- **Shlagbaumni ochishdan oldingi ikki bosqichli himoya:** to'liq ishlab
  turgan `dist/index.js` orqali (soxta backend + soxta kamera server bilan,
  ikkita farqli test kadr — harakatni haqiqiy tetiklash uchun) uchta ssenariy
  tekshirildi:
  - ikkala kadr ham bir xil nomer + yuqori ishonch → shlagbaum ochishga
    urindi (`openBarrier()` chaqirilgani logdan tasdiqlandi),
  - ikkinchi kadr boshqa nomer qaytardi → shlagbaum **ochilmadi**, aniq log
    bilan (`openBarrier()` chaqirilmadi),
  - birinchi kadrning ishonchi past (`0.6 < 0.75`) → ikkinchi tekshiruv
    **umuman boshlanmadi**, shlagbaum darhol o'tkazib yuborildi.

Real IP kamera vaqti-vaqti bilan tarmoqda mavjud emasligi sababli (jismoniy
qurilma holati) va Python OCR xizmati (`s-python`) ham hozircha ishga
tushirilmagani sababli, harakat aniqlash → shlagbaum ochilishigacha bo'lgan
to'liq zanjirni **haqiqiy nomer va real OCR natijasi** bilan yakuniy
tekshirish stoyankada amalga oshiriladi.

- **Live View:** haqiqiy `s-backend` + haqiqiy `dist/index.js` + soxta
  kamera serverlar bilan to'liq end-to-end sinaldi (real Socket.IO, real
  JWT bilan operator sifatida `GET /api/live-view`ga so'rov yuborib):
  - bitta tomoshabin (Kirish) → `200`, to'g'ri `Content-Type`, chunklar
    ketma-ket qabul qilindi; tomoshabin uzilganda kameraga ochilgan HTTP
    ulanish darhol yopilgani mock kamera logidan tasdiqlandi,
  - **ikkita tomoshabin bir vaqtda** (bir xil tur) → ikkalasi ham to'g'ri,
    bir xil ma'lumot oldi, lekin kameraga faqat **bitta** ulanish ochildi
    (backend fan-out'i + agentning takroriy-start himoyasi ishladi),
  - **Kirish va Chiqish bir vaqtda** → ikkalasi ham mustaqil, to'g'ri,
    aralashmagan ma'lumot bilan ishladi,
  - kamera o'chirilganda (mock server to'xtatildi) → aniq **502** va
    `"Kameraga ulanib bo'lmadi: connect ECONNREFUSED ..."` xabari tomoshabinga
    yetib bordi,
  - Kirish kamerasi o'chgan holatda ham **Chiqish** butunlay normal ishlashda
    davom etdi (mustaqillik tasdiqlandi).

## Backend'da qilingan qo'shimcha o'zgarishlar (s-backend)

Ushbu funksiya uchun `s-backend`da ham kichik, orqaga mos (additive)
o'zgarishlar qilindi:

- **`src/modules/parking/parking.service.ts`** — `entryAuto`/`exitAuto`
  javobiga `confidence` maydoni qo'shildi (`ocrResult.confidence`) — avval bu
  qiymat backend ichida hisoblanardi, lekin javobga chiqarilmagan edi.
- **`src/modules/agent/agent.controller.ts`** — yangi `verifyHandler`:
  rasmni qabul qilib, mavjud `detectPlate()` orqali OCR qiladi, **sessiya
  yaratmasdan/bazaga yozmasdan** `{ plate, confidence }` qaytaradi.
- **`src/modules/agent/agent.routes.ts`** — yangi marshrut:
  `POST /api/agent/parking/verify` (mavjud `agentAuth` — `X-Agent-Key` bilan
  himoyalangan, xuddi `/entry`, `/exit` kabi).

`s-python` (OCR modeli) o'zgarmadi — u hech qachon tashqi tarmoqqa
ochilmaydi, faqat `s-backend` orqali (ichki, `localhost`) chaqiriladi.

**Heartbeat uchun qo'shilgan o'zgarishlar:**

- **`migrations/20260715090000_add_last_heartbeat_to_settings.ts`** (yangi) —
  `tb_settings` ga `last_heartbeat_at` (nullable timestamp) ustuni.
- **`src/modules/settings/settings.service.ts`** — yangi
  `recordHeartbeat(orgId)`: `last_heartbeat_at` ni joriy vaqt bilan
  yangilaydi. `SettingsRecord` interfeysiga ham qo'shildi — shu orqali
  mavjud `GET /api/settings` javobida (Admin panel uchun) ham avtomatik
  ko'rinadi.
- **`src/modules/agent/agent.controller.ts`** — yangi `heartbeatHandler`.
- **`src/modules/agent/agent.routes.ts`** — yangi, alohida
  `agentHeartbeatRouter` (parking rate-limit bilan ULASHILMAYDI — heartbeat
  har 30 soniyada doimiy keladi, parking so'rovlari uchun mo'ljallangan
  chelakni "yeb qo'ymasligi" kerak).
- **`src/app.ts`** — yangi marshrut mount qilindi:
  `POST /api/agent/heartbeat` (`X-Agent-Key` bilan himoyalangan).

## Natija

**s-agent:**
- `src/camera.ts`, `src/motion.ts`, `src/barrier.ts`, `src/server.ts`
  (`sendHeartbeat()` qo'shildi), `src/queueProcessor.ts`,
  `src/configFetcher.ts`, `src/agentConfig.ts`, `src/liveView.ts`,
  `src/lock.ts`, `src/config.ts`, `src/errors.ts`, `src/logger.ts`,
  `src/agent.ts` (`watchHeartbeat()` qo'shildi), `src/index.ts`
- `.env`, `.env.example`, `package.json` (`socket.io-client`, `winston`,
  `winston-daily-rotate-file` qo'shildi, `pm2:*` skriptlari),
  `ecosystem.config.js` (PM2 konfiguratsiyasi — `kill_timeout` oshirildi),
  `tsconfig.json`, `.gitignore` (yangi log formati va `lock/` qo'shildi),
  `README.md`

**s-backend:**
- `migrations/20260715090000_add_last_heartbeat_to_settings.ts` (yangi),
  `src/modules/settings/settings.service.ts` (`recordHeartbeat()` qo'shildi),
  `src/modules/parking/parking.service.ts`,
  `src/modules/agent/agent.controller.ts` (`heartbeatHandler` qo'shildi),
  `src/modules/agent/agent.routes.ts` (`agentHeartbeatRouter` qo'shildi),
  `src/app.ts` (yangi marshrut mount qilindi)

Ikkala loyihada ham `tsc --noEmit` xatosiz o'tadi, `s-agent`da `npm run build`
ham xatosiz.
