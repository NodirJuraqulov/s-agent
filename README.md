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
│   ├── camera.ts         — kameradan snapshot (JPEG buffer) olish
│   ├── motion.ts         — ikki kadrni grayscale piksel farqi orqali solishtirish (sharp, pure function)
│   ├── barrier.ts         — shlagbaum relay moduliga serialport orqali signal (port dinamik)
│   ├── server.ts          — s-backend bilan aloqa (POST /api/agent/parking/{entry|exit|verify})
│   ├── queueProcessor.ts  — offline navbatni (queue/) qayta ishlash
│   ├── configFetcher.ts   — GET /api/agent/config — backend'dan kamera/shlagbaum sozlamalarini oladi
│   ├── agentConfig.ts     — backend'dan kelgan sozlamalarning global (dinamik) holati
│   ├── liveView.ts        — Live View: Socket.IO orqali kamera oqimini backend'ga "quvur" kabi uzatish
│   ├── config.ts          — .env o'zgaruvchilarini o'qish va validatsiya (faqat LOCAL sozlamalar)
│   ├── errors.ts          — xatolarni logga yozish uchun o'qiladigan matnga aylantirish
│   ├── logger.ts           — console + fayl (logs/agent.log) logging
│   ├── agent.ts            — Kirish, Chiqish, Navbat, Konfiguratsiya va Live View oqimlari (parallel)
│   └── index.ts            — kirish nuqtasi
├── logs/            — ish vaqtidagi loglar (agent.log)
├── queue/           — s-backend ga yuborib bo'lmagan so'rovlar (runtime, git'ga qo'shilmaydi)
│   └── failed/      — 5 marta urinishdan keyin ham yuborilmagan so'rovlar
├── .env             — mahalliy sozlamalar (git'ga qo'shilmaydi)
├── .env.example     — namuna sozlamalar
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

## Avtostart sozlash

- **Windows:** Task Scheduler orqali `npm start` (yoki `node dist/index.js`)
  buyrug'ini tizim yuklanganda ishga tushiradigan vazifa yarating, yoki
  `node-windows` paketidan foydalanib Windows Service sifatida o'rnating.
- **Linux:** `systemd` service fayli yarating (masalan
  `/etc/systemd/system/s-agent.service`) va `WorkingDirectory` +
  `ExecStart=/usr/bin/node dist/index.js` ni ko'rsating, so'ng
  `systemctl enable s-agent`.

## Ishga tushish jarayoni (index.ts)

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
- Barcha xatolar konsolga **va** `logs/agent.log` fayliga yoziladi —
  `errors.ts` dagi `describeError()` orqali (Node'ning "localhost"ga
  ulanishda ikkala IPv4/IPv6 ham rad etilgan holatlarida xato `.message`si
  bo'sh `AggregateError` bo'lib qolishining oldini oladi).

## Test qilingani

Ushbu kompyuterda (haqiqiy `s-backend` va MySQL bazasi bilan, real
`GET /api/agent/config` orqali):

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

## Natija

**s-agent:**
- `src/camera.ts`, `src/motion.ts`, `src/barrier.ts`, `src/server.ts`,
  `src/queueProcessor.ts`, `src/configFetcher.ts`, `src/agentConfig.ts`,
  `src/liveView.ts` (yangi), `src/config.ts`, `src/errors.ts`, `src/logger.ts`,
  `src/agent.ts`, `src/index.ts`
- `.env`, `.env.example`, `package.json` (`socket.io-client` qo'shildi),
  `tsconfig.json`, `.gitignore`, `README.md`

**s-backend:**
- `src/modules/parking/parking.service.ts`,
  `src/modules/agent/agent.controller.ts`, `src/modules/agent/agent.routes.ts`

Ikkala loyihada ham `tsc --noEmit` xatosiz o'tadi, `s-agent`da `npm run build`
ham xatosiz.
