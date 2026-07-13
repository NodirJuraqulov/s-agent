# s-agent — AutoStoyanka Local Agent

Stoyanka kompyuterida ishlaydigan Node.js dastur. **Ikkita IP kamerani**
(Kirish va Chiqish) **parallel** kuzatadi, harakat (mashina) sezadi, avtomatik
rasm oladi, `s-backend` ga yuboradi va (ixtiyoriy) shlagbaumga signal beradi.

Harakat aniqlash **toza JavaScript** (`sharp`) orqali amalga oshiriladi — native
kompilyatsiya talab qiladigan OpenCV bog'liqligi yo'q, shu sabab `npm install`
har qanday kompyuterda tez va muammosiz ishlaydi.

## Fayl strukturasi

```
s-agent/
├── src/
│   ├── camera.ts    — kameradan snapshot (JPEG buffer) olish
│   ├── motion.ts    — ikki kadrni grayscale piksel farqi orqali solishtirish (sharp, pure function)
│   ├── barrier.ts   — shlagbaum relay moduliga serialport orqali signal
│   ├── server.ts    — s-backend bilan aloqa (POST /api/agent/parking/{entry|exit})
│   ├── config.ts    — .env o'zgaruvchilarini o'qish va validatsiya
│   ├── logger.ts    — console + fayl (logs/agent.log) logging
│   ├── agent.ts     — Kirish, Chiqish va Navbat oqimlari (parallel): capture → motion → send → barrier
│   ├── queueProcessor.ts — offline navbatni (queue/) qayta ishlash
│   └── index.ts     — kirish nuqtasi
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

## O'rnatish

```bash
cd s-agent
npm install
cp .env.example .env   # so'ng .env faylini o'z qiymatlaringiz bilan tahrirlang
```

`.env` qiymatlari:

| O'zgaruvchi | Tavsif |
|---|---|
| `CAMERA_ENTRY_URL` | Kirish kamerasining snapshot URL manzili |
| `CAMERA_EXIT_URL` | Chiqish kamerasining snapshot URL manzili |
| `SERVER_URL` | s-backend manzili |
| `ORG_ID` | Stoyankaning tashkilot ID raqami |
| `AGENT_API_KEY` | Local Agent ↔ server autentifikatsiya kaliti (`X-Agent-Key` header, muddatsiz) |
| `BARRIER_PORT` | Relay modul porti (masalan `COM3` yoki `/dev/ttyUSB0`). Bo'sh qoldirilsa — shlagbaum funksiyasi o'chirilgan holda ishlaydi |
| `BARRIER_OPEN_SECONDS` | Shlagbaum necha soniya ochiq turadi |
| `CAPTURE_INTERVAL_MS` | Kameradan necha millisoniyada bir kadr olinadi |
| `MOTION_THRESHOLD` | Harakat deb hisoblanadigan o'rtacha piksel farqi chegarasi |

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

## Ishlash mantig'i

Kirish va Chiqish kameralari **ikkita mustaqil oqim** (`watchEntry` /
`watchExit`, `agent.ts`) sifatida `Promise.all` orqali bir vaqtda ishga
tushiriladi. Har biri o'z `previousFrame` holatini alohida saqlaydi (`motion.ts`
pure function — holatni o'zida saqlamaydi), shu sababli ikkala oqim bir-biriga
xalaqit bermaydi. Har ikkalasi ham quyidagi mantiqni bajaradi:

1. Kameradan kadr olinadi va oldingi kadr bilan solishtiriladi: ikkalasi ham
   `sharp` orqali grayscale + 320x240 ga kichraytiriladi (`raw` piksel
   massivi), so'ng piksel-piksel farqning o'rtachasi (`avgDiff`) hisoblanadi.
2. `avgDiff > MOTION_THRESHOLD` bo'lsa — harakat aniqlandi (`"Kirish: ..."`
   yoki `"Chiqish: ..."` prefiksi bilan logga yoziladi):
   - 2 soniya kutiladi (mashina to'xtamaguncha),
   - yangi rasm olinadi,
   - `POST {SERVER_URL}/api/agent/parking/entry` (yoki `.../exit`) ga
     `multipart/form-data` (`image`) va `X-Agent-Key: {AGENT_API_KEY}` header
     bilan yuboriladi.
3. Javob `{ detected, session: { plate_number } }` shaklida qaytadi:
   - `detected: true` → nomer (`session.plate_number`) logga yoziladi va
     shlagbaum ochiladi (agar ulangan bo'lsa — hozircha ham Kirish, ham
     Chiqishda bir xil tarzda ochiladi),
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
2. **`watchQueue()`** (`agent.ts`) — Kirish/Chiqishdan mustaqil uchinchi oqim,
   har 30 soniyada `queue/` hajmini tekshiradi; bo'sh bo'lmasa
   `processQueue()` ni chaqiradi.
3. **`processQueue()`** (`queueProcessor.ts`) — navbatdagi fayllarni eng
   eskisidan boshlab ketma-ket qayta yuboradi:
   - muvaffaqiyatli bo'lsa — fayl darhol o'chiriladi,
   - muvaffaqiyatsiz bo'lsa — `attempts` oshirilib fayl saqlanadi,
   - `attempts >= 5` bo'lsa — fayl `queue/failed/`ga ko'chiriladi (butunlay
     yo'qotilmaydi, lekin cheksiz urinish ham to'xtaydi).
4. **Dastur ishga tushganda** (`index.ts`) — asosiy oqimlar boshlanishidan
   oldin `processQueue()` bir marta chaqiriladi, shunda agent o'chirilgan
   paytda navbatda qolган so'rovlar darhol qayta yuboriladi.

> **MUHIM — `captured_at`:** navbatga saqlangan so'rov keyinroq (masalan
> internetsiz 10 daqiqadan so'ng) yuborilganda, backend `entered_at`/`exited_at`
> vaqtini **so'rov qachon yuborilgani emas, rasm qachon olingani** bo'yicha
> belgilashi kerak — aks holda stoyanka vaqti va to'lov hisobi noto'g'ri
> chiqadi. Shu sabab har bir `POST /api/agent/parking/{entry|exit}` so'roviga
> `multipart/form-data` maydoni sifatida **`captured_at`** (ISO 8601, rasm
> olingan payt) qo'shib yuboriladi — bu barcha so'rovlarda (darhol yoki
> navbatdan) doim jo'natiladi. **`s-backend` hozircha bu maydonni qabul
> qilib, `entered_at`/`exited_at` sifatida ishlatishi kerak** — agar hozirgi
> backend uni e'tiborsiz qoldirsa, vaqt hisobi navbatga tushgan holatlar uchun
> noto'g'ri bo'ladi.

Navbat testdan o'tkazildi (mock server bilan): server o'chirilganda saqlash,
qayta yoqilganda muvaffaqiyatli qayta yuborish va o'chirish, 401'da
saqlanmaslik, va doimiy 5xx holatida 5 urinishdan keyin `failed/`ga ko'chishi
— barchasi kutilganidek ishladi.

## Xatolarga chidamlilik

- **Kamera/internet uzilsa yoki har qanday kutilmagan xato bo'lsa:** tegishli
  oqim (Kirish yoki Chiqish, `agent.ts`) buni ushlab, logga yozadi va 5
  soniyadan so'ng qayta urinadi — ikkinchi oqimga ta'sir qilmaydi, dastur
  to'xtamaydi.
- **s-backend javob bermasa (tarmoq/5xx):** rasm yo'qolmaydi — yuqoridagi
  "Offline navbat" bo'limiga qarang.
- **s-backend 401/409 kabi "kutilgan" xato qaytarsa:** navbatga saqlanmaydi,
  operator "Nomer aniqlanmadi" holatida xabardor qilinadi, sikl davom etadi.
- **Shlagbaum ulanmagan/xato bo'lsa:** signal yuborilmaydi, log yoziladi,
  qolgan jarayon davom etadi.
- Barcha xatolar konsolga **va** `logs/agent.log` fayliga yoziladi.

## Natija

Loyiha quyidagi fayllardan iborat holda tayyor:

- `src/camera.ts`, `src/motion.ts`, `src/barrier.ts`, `src/server.ts`,
  `src/queueProcessor.ts`, `src/config.ts`, `src/logger.ts`, `src/agent.ts`,
  `src/index.ts`
- `.env`, `.env.example`, `package.json`, `tsconfig.json`, `.gitignore`,
  `README.md`

`tsc --noEmit` va `npm run build` xatosiz o'tadi. Offline navbat mexanizmi
mock server bilan to'liq sinovdan o'tkazildi (yuqoriga qarang). Ikkita
haqiqiy kamera bilan to'liq ishga tushirish/end-to-end test — real stoyanka
kompyuterida amalga oshiriladi.
