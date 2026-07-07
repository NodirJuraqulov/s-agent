# s-agent — AutoStoyanka Local Agent

Stoyanka kompyuterida ishlaydigan Node.js dastur. IP kamerani kuzatadi, harakat
(mashina) sezadi, avtomatik rasm oladi, `s-backend` ga yuboradi va (ixtiyoriy)
shlagbaumga signal beradi.

Harakat aniqlash **toza JavaScript** (`sharp`) orqali amalga oshiriladi — native
kompilyatsiya talab qiladigan OpenCV bog'liqligi yo'q, shu sabab `npm install`
har qanday kompyuterda tez va muammosiz ishlaydi.

## Fayl strukturasi

```
s-agent/
├── src/
│   ├── camera.ts    — kameradan snapshot (JPEG buffer) olish
│   ├── motion.ts    — ikki kadrni grayscale piksel farqi orqali solishtirish (sharp)
│   ├── barrier.ts   — shlagbaum relay moduliga serialport orqali signal
│   ├── server.ts    — s-backend bilan aloqa (POST /api/parking/entry)
│   ├── config.ts    — .env o'zgaruvchilarini o'qish va validatsiya
│   ├── logger.ts    — console + fayl (logs/agent.log) logging
│   ├── agent.ts     — asosiy sikl: capture → motion → send → barrier
│   └── index.ts     — kirish nuqtasi
├── logs/            — ish vaqtidagi loglar (agent.log)
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
| `CAMERA_URL` | IP kameraning snapshot URL manzili |
| `SERVER_URL` | s-backend manzili |
| `ORG_ID` | Stoyankaning tashkilot ID raqami |
| `SECRET_KEY` | Local Agent ↔ server autentifikatsiya kaliti (`Authorization: Bearer`) |
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

1. Kameradan kadr olinadi va oldingi kadr bilan solishtiriladi: ikkalasi ham
   `sharp` orqali grayscale + 320x240 ga kichraytiriladi (`raw` piksel
   massivi), so'ng piksel-piksel farqning o'rtachasi (`avgDiff`) hisoblanadi.
2. `avgDiff > MOTION_THRESHOLD` bo'lsa — harakat aniqlandi:
   - 2 soniya kutiladi (mashina to'xtamaguncha),
   - yangi rasm olinadi,
   - `POST {SERVER_URL}/api/parking/entry` ga `multipart/form-data`
     (`image`) va `Authorization: Bearer {SECRET_KEY}` header bilan
     yuboriladi.
3. Javob `{ detected, session: { plate_number } }` shaklida qaytadi:
   - `detected: true` → nomer (`session.plate_number`) logga yoziladi va
     shlagbaum ochiladi (agar ulangan bo'lsa),
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

## Xatolarga chidamlilik

- **Kamera/internet uzilsa yoki har qanday kutilmagan xato bo'lsa:** asosiy
  sikl (`agent.ts`) buni ushlab, logga yozadi va 5 soniyadan so'ng qayta
  urinadi — dastur to'xtamaydi.
- **s-backend javob bermasa:** `sendToServer` xatoni ushlab logga yozadi va
  `{ detected: false }` qaytaradi — operator "Nomer aniqlanmadi" holatida
  xabardor qilinadi, sikl davom etadi.
- **Shlagbaum ulanmagan/xato bo'lsa:** signal yuborilmaydi, log yoziladi,
  qolgan jarayon davom etadi.
- Barcha xatolar konsolga **va** `logs/agent.log` fayliga yoziladi.

## Natija

Loyiha quyidagi fayllardan iborat holda tayyor:

- `src/camera.ts`, `src/motion.ts`, `src/barrier.ts`, `src/server.ts`,
  `src/config.ts`, `src/logger.ts`, `src/agent.ts`, `src/index.ts`
- `.env`, `.env.example`, `package.json`, `tsconfig.json`, `.gitignore`,
  `README.md`

`npm install` va `npm run build` ushbu kompyuterda **muvaffaqiyatli**
o'tkazildi (native bog'liqlik yo'q, faqat `sharp` prebuilt binary yuklaydi).
`node dist/index.js` orqali qisqa smoke-test ham o'tkazildi: loglar to'g'ri
yoziladi (console + `logs/agent.log`), shlagbaum ulanmagan holatda ham dastur
yiqilmadi. Haqiqiy IP kamera bilan to'liq end-to-end test — real stoyanka
kompyuterida amalga oshiriladi.
