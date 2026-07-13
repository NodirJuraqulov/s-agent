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
│   ├── server.ts          — s-backend bilan aloqa (POST /api/agent/parking/{entry|exit})
│   ├── queueProcessor.ts  — offline navbatni (queue/) qayta ishlash
│   ├── configFetcher.ts   — GET /api/agent/config — backend'dan kamera/shlagbaum sozlamalarini oladi
│   ├── agentConfig.ts     — backend'dan kelgan sozlamalarning global (dinamik) holati
│   ├── config.ts          — .env o'zgaruvchilarini o'qish va validatsiya (faqat LOCAL sozlamalar)
│   ├── errors.ts          — xatolarni logga yozish uchun o'qiladigan matnga aylantirish
│   ├── logger.ts           — console + fayl (logs/agent.log) logging
│   ├── agent.ts            — Kirish, Chiqish, Navbat va Konfiguratsiya oqimlari (parallel)
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
3. Javob `{ detected, session: { plate_number } }` shaklida qaytadi:
   - `detected: true` → nomer (`session.plate_number`) logga yoziladi. Agar
     joriy konfiguratsiyada `barrier_enabled: true` bo'lsa — shlagbaum
     ochiladi: qaysi port ishlatilishi `barrier_mode`ga bog'liq —
     `"separate"` bo'lsa Chiqish o'zining alohida portidan (`barrier_exit_port`)
     foydalanadi, aks holda (`"single"` yoki belgilanmagan) ikkalasi ham
     `barrier_entry_port`dan foydalanadi (backend'dagi
     `settingsService.testBarrier` bilan bir xil mantiq — `agentConfig.ts` →
     `resolveBarrierPort()`).
   - `detected: false` → operator server tomonidan xabardor qilinadi
     (WebSocket/polling — bu `s-backend` va frontend tomonida amalga
     oshiriladi).
4. Harakatdan keyin 5 soniya "sovish" pauzasi qo'yiladi — bitta mashina uchun
   qayta-qayta ishga tushmasligi uchun.

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

Real IP kamera vaqti-vaqti bilan tarmoqda mavjud emasligi sababli (jismoniy
qurilma holati), harakat aniqlash → shlagbaum ochilishigacha bo'lgan to'liq
zanjirni haqiqiy mashina bilan yakuniy tekshirish stoyankada amalga
oshiriladi.

## Natija

- `src/camera.ts`, `src/motion.ts`, `src/barrier.ts`, `src/server.ts`,
  `src/queueProcessor.ts`, `src/configFetcher.ts`, `src/agentConfig.ts`,
  `src/config.ts`, `src/errors.ts`, `src/logger.ts`, `src/agent.ts`,
  `src/index.ts`
- `.env`, `.env.example`, `package.json`, `tsconfig.json`, `.gitignore`,
  `README.md`

`tsc --noEmit` va `npm run build` xatosiz o'tadi.
