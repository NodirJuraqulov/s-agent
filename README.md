# s-agent — AutoStoyanka Local Agent

Stoyanka kompyuterida ishlaydigan Node.js dastur. Kirish va Chiqish IP
kameralarini parallel kuzatadi, harakat (mashina) sezadi, rasm oladi,
`s-backend`ga yuboradi va (sozlangan bo'lsa) shlagbaumga signal beradi.

## Fayl strukturasi

```
s-agent/
├── src/
│   ├── index.ts           — kirish nuqtasi, lock, graceful shutdown
│   ├── agent.ts            — Kirish/Chiqish/Navbat/Konfiguratsiya/Heartbeat oqimlari
│   ├── camera.ts            — kameradan JPEG kadr olish (snapshot va MJPEG stream)
│   ├── motion.ts             — ikki kadrni solishtirib harakatni aniqlash
│   ├── barrier.ts             — shlagbaum relayiga serialport orqali signal
│   ├── server.ts              — s-backend bilan aloqa (parking/entry, exit, verify, heartbeat)
│   ├── queueProcessor.ts      — offline navbatni (queue/) qayta ishlash
│   ├── configFetcher.ts       — GET /api/agent/config chaqiruvi
│   ├── agentConfig.ts         — backend'dan kelgan konfiguratsiyaning global holati
│   ├── liveView.ts            — kamera oqimini Socket.IO orqali backend'ga uzatish
│   ├── config.ts              — .env o'zgaruvchilarini o'qish va validatsiya
│   ├── lock.ts                — bitta nusxa kafolati
│   ├── logger.ts              — winston logging (kunlik rotatsiya)
│   └── errors.ts               — xatolarni o'qiladigan matnga aylantirish
├── logs/            — agent-YYYY-MM-DD.log (14 kundan keyin avtomatik o'chadi)
├── lock/            — agent.lock (runtime, git'ga qo'shilmaydi)
├── queue/           — yuborib bo'lmagan so'rovlar (runtime, git'ga qo'shilmaydi)
│   ├── failed/      — 5 marta urinishdan keyin ham yuborilmagan so'rovlar
│   └── corrupted/   — o'qib bo'lmaydigan (buzilgan) navbat fayllari
├── .env             — mahalliy sozlamalar (git'ga qo'shilmaydi)
├── .env.example     — namuna sozlamalar
├── ecosystem.config.js — PM2 konfiguratsiyasi
└── package.json
```

## Talablar

- Node.js 18+
- Shlagbaum ulanadigan bo'lsa: USB yoki RS-485 relay modul (COM port /
  `/dev/ttyUSBx`)
- Qo'shimcha native build vositalari (Python, OpenCV va h.) kerak emas —
  harakat aniqlash `sharp` orqali, prebuilt binary bilan ishlaydi
- `s-backend`da `GET /api/agent/config` va tegishli parking/heartbeat
  endpointlari ishlashi kerak

## O'rnatish

```bash
npm install
cp .env.example .env
```

So'ng `.env` faylini o'z qiymatlaringiz bilan tahrirlang.

## `.env` sozlamalari

| O'zgaruvchi | Majburiymi | Standart | Tavsif |
|---|---|---|---|
| `SERVER_URL` | Ha | — | `s-backend` manzili (masalan `http://192.168.1.10:5000`) |
| `AGENT_API_KEY` | Ha | — | `X-Agent-Key` header — backend tomonida tashkilotni aniqlaydigan autentifikatsiya kaliti |
| `CAMERA_USERNAME` | Yo'q | `admin` | Kamera HTTP Basic Auth login — faqat backend'da kamera login sozlanmagan holatlar uchun fallback |
| `CAMERA_PASSWORD` | Yo'q | `admin` | Kamera HTTP Basic Auth parol — xuddi shunday fallback |
| `CAPTURE_INTERVAL_MS` | Yo'q | `2000` | Kameradan necha millisoniyada bir kadr tekshiriladi |
| `MOTION_THRESHOLD` | Yo'q | `20` | Harakat deb hisoblanadigan o'rtacha piksel farqi (0–255 oralig'ida) |
| `BARRIER_CONFIDENCE_THRESHOLD` | Yo'q | `0.75` | Shlagbaumni ochish uchun talab qilinadigan OCR ishonch darajasi (0–1) |

`SERVER_URL` yoki `AGENT_API_KEY` yo'q/bo'sh bo'lsa, dastur ishga
tushmasdan aniq xato bilan to'xtaydi (`logs/fatal-startup-errors.log`ga
ham yoziladi).

**Kamera URL'lari, kamera login/paroli va shlagbaum sozlamalari `.env`da
emas** — quyidagi "Konfiguratsiya backend'dan" bo'limiga qarang.

## Ishga tushirish

Development rejimida (qayta kompilyatsiyasiz, avtomatik qayta yuklash):

```bash
npm run dev
```

Production uchun (build qilib, keyin ishga tushirish):

```bash
npm run build
npm start
```

## Avtostart va avtomatik qayta ko'tarilish (PM2)

Stoyanka kompyuteri qanday operatsion tizim ekani oldindan noma'lum
bo'lgani uchun **PM2** ishlatiladi — Windows, macOS va Linux'ning
barchasida bir xil ishlaydigan Node.js process-menejeri. PM2 ikki narsani
ta'minlaydi: qulasa avtomatik qayta ko'tarish va kompyuter qayta
yuklanganda avtomatik ishga tushish.

Loyihada tayyor `ecosystem.config.js` fayli bor — barcha 3 platformada
bir xil ishlaydi.

### 1-qadam — barcha platformalarda umumiy

```bash
npm install -g pm2
npm run build

pm2 start ecosystem.config.js
pm2 save
```

Foydali buyruqlar:

```bash
npm run pm2:status
npm run pm2:logs
npm run pm2:restart
npm run pm2:stop
```

### 2-qadam — kompyuter yuklanganda avtomatik ishga tushish

#### Windows

PM2'ning o'zi Windows'da `pm2 startup` orqali ishlay olmaydi (bu faqat
systemd/launchd bor tizimlar uchun) — shuning uchun qo'shimcha paket kerak:

```bash
npm install -g pm2-windows-startup
pm2-startup install
```

#### macOS

```bash
pm2 startup
```

Ekranga `sudo env PATH=... pm2 startup launchd -u <foydalanuvchi> --hp <uy-papka>`
ko'rinishidagi buyruq chiqadi — shu buyruqni nusxalab, o'zingiz ishga
tushiring (PM2 buni avtomatik bajarmaydi, chunki `sudo` kerak).

#### Linux

```bash
pm2 startup
```

Ekranga chiqqan `sudo ...` buyrug'ini nusxalab ishga tushiring. PM2
distributivingizga mos init tizimini (odatda `systemd`) avtomatik aniqlaydi.

## Konfiguratsiya backend'dan

Kamera URL'lari, kamera login/paroli va shlagbaum sozlamalari `.env`da
emas — bular `s-backend`dagi `GET /api/agent/config` orqali olinadi:

- Ishga tushganda bir marta olinadi.
- Shundan keyin `watchConfig()` (`agent.ts`) har **60 soniyada** qayta
  chaqiradi va natijani global holatga (`agentConfig.ts`) yozadi.
- Super Admin web panelda kamera/shlagbaum sozlamalari o'zgartirilsa,
  s-agentni qayta ishga tushirish shart emas — keyingi 60 soniya ichida
  o'zi yangi qiymatlarni oladi.
- Backend'dan vaqtincha javob kelmasa (server o'chgan, tarmoq muammosi),
  dastur to'xtamaydi — eski (oxirgi muvaffaqiyatli) konfiguratsiya bilan
  davom etadi.
- Hali hech qachon konfiguratsiya olinmagan bo'lsa, Kirish/Chiqish
  oqimlari buni aniq log bilan bildirib, avtomatik qayta urinaveradi.

Backend'dan keladigan maydonlar: `camera_entry_url`, `camera_exit_url`,
`camera_username`, `camera_password`, `barrier_enabled`, `barrier_mode`
(`single`/`separate`), `barrier_entry_port`, `barrier_exit_port`,
`barrier_open_seconds`.

## Bitta nusxa kafolati (lock)

`lock/agent.lock` faylida joriy jarayon PID'i saqlanadi — bu shu
kompyuterda s-agentning tasodifan ikki marta ishga tushirilishining
oldini oladi (masalan texnik xodim qo'lda qayta ishga tushirmoqchi
bo'lsa, lekin eski nusxa PM2 orqali fonda allaqachon ishlab turgan
bo'lsa). Ikkinchi nusxa ishga tushganda:

- Agar lock fayldagi PID hali jonli bo'lsa — darhol xato bilan to'xtaydi.
- Agar PID endi jonli bo'lmasa (eskirgan lock, masalan avvalgi nusxa
  kutilmagan tarzda qulagan) — eski faylni almashtirib, oddiy davom
  etadi.

## Offline navbat (queue)

`s-backend` vaqtincha ishlamasa yoki tarmoq uzilsa, rasm yo'qolmaydi —
`queue/`ga JSON fayl sifatida saqlanadi va keyinroq avtomatik qayta
yuboriladi:

- Tarmoq xatosi / timeout / 5xx — rasm navbatga saqlanadi.
- 401/409 kabi 4xx xato (qayta urinish yordam bermaydi) — navbatga
  saqlanmaydi, sabab aniq logga yoziladi (`auth_error`/`duplicate`/`client_error`).
- Har 30 soniyada (`watchQueue()`) navbat tekshiriladi va bo'sh bo'lmasa
  qayta yuborishga urinadi.
- 5 marta urinishdan keyin ham yuborilmasa — fayl `queue/failed/`ga
  ko'chiriladi.
- O'qib bo'lmaydigan (buzilgan) fayl — `queue/corrupted/`ga ko'chiriladi
  (abadiy qayta urinilmaydi).

## Heartbeat

`watchHeartbeat()` har 30 soniyada `POST {SERVER_URL}/api/agent/heartbeat`
ga kichik so'rov yuboradi — shu orqali operator/Super Admin panelda
s-agent oflayn bo'lib qolganini bilish mumkin bo'ladi. So'rov birga
quyidagilarni ham yuboradi:

- kamera holati (`camera_entry_ok`/`camera_exit_ok`) — eng so'nggi
  kadr olish urinishi muvaffaqiyatli bo'lgan-bo'lmaganini bildiradi,
- `failed_queue_count` — `queue/failed/`da qolib ketgan (5 marta
  yuborilmagan) so'rovlar soni, shunda operator navbat orqasida
  to'planib qolgan hodisalar borligini heartbeat orqali biladi.

Heartbeat muvaffaqiyatsiz bo'lsa — bu boshqa hech qanday oqimga ta'sir
qilmaydi, faqat ogohlantirish sifatida logga yoziladi.

## Qo'shimcha hujjatlar

- [`kamera-sozlash-qollanma.md`](./kamera-sozlash-qollanma.md) — kamerani sozlash
- [`docs/kamera-joylashuv-qollanma.md`](./docs/kamera-joylashuv-qollanma.md) — kamera joylashuvi
- [`docs/vaqt-sinxronizatsiya-qollanma.md`](./docs/vaqt-sinxronizatsiya-qollanma.md) — vaqt sinxronizatsiyasi
