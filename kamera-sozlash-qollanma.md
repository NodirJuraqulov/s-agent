# Kamera uchun doimiy IP manzil sozlash (DHCP Reservation)

Bu qo'llanma har bir yangi stoyanka o'rnatilganda, IP kameralarning
IP manzili o'zgarib qolmasligi uchun **bir martalik** bajariladi.

## Nima uchun kerak?

Router odatda qurilmalarga IP manzilni **avtomatik va o'zgaruvchan**
tarzda beradi (bu — DHCP). Kamera bugun `192.168.1.100` olsa,
ertaga (masalan elektr o'chib-yonganda yoki router qayta yuklanganda)
boshqa IP olishi mumkin. Bizning tizimda esa `s-agent` kamerani
**qat'iy belgilangan IP manzil** orqali qidiradi
(`s-agent/.env` dagi `CAMERA_ENTRY_URL` / `CAMERA_EXIT_URL`).
Agar IP o'zgarsa, agent kamerani topa olmay, tizim ishlamay qoladi.

**DHCP Reservation** — routerga "bu aniq qurilmaga har doim aynan
shu IP ni ber" deb bir marta buyruq berish. Shundan keyin kamera
necha marta o'chib-yonmasin, IP manzili hech qachon o'zgarmaydi.

## Kerakli narsalar

- Kameraning **MAC manzili** (har bir tarmoq qurilmasining
  o'zgarmas, noyob "seriya raqami")
- Router administrator paneliga kirish huquqi (odatda
  `192.168.1.1` yoki `192.168.0.1` manzilida)

## 1-qadam — Kameraning MAC manzilini topish

Eng oson yo'l — router paneli orqali:

1. Routerning admin panelini brauzerda oching
   (odatda `192.168.1.1` yoki `192.168.0.1`)
2. **"Connected Devices"**, **"Client List"** yoki **"DHCP Clients"**
   bo'limini toping
3. Ro'yxatda kamera nomini (yoki uning hozirgi IP manzilini) toping
4. Shu qatorda MAC manzil ko'rsatilgan bo'ladi — odatda
   `AA:BB:CC:DD:EE:FF` ko'rinishida

## 2-qadam — DHCP Reservation sozlash

Bu bo'lim routerga qarab turli nomda bo'lishi mumkin:
**"DHCP Reservation"**, **"Address Reservation"**,
**"Static DHCP"** yoki **"IP & MAC Binding"**.

Odatiy jarayon (ko'pchilik routerlarda deyarli bir xil):

1. Router admin panelida **DHCP** yoki **LAN** sozlamalariga o'ting
2. **"DHCP Reservation"** (yoki yuqoridagi nomlardan biri) bo'limini
   toping
3. **"Add"** / **"+"** tugmasini bosing
4. Quyidagilarni kiriting:
    - **MAC manzil** — 1-qadamda topilgan MAC
    - **IP manzil** — kameraga berilishini xohlagan doimiy IP
      (masalan `192.168.1.100`) — kamera hozir ishlatayotgan IP
      bilan bir xil qilib qo'yish tavsiya etiladi, shunda hech
      narsa qayta sozlash shart bo'lmaydi
    - **Qurilma nomi** (ixtiyoriy) — masalan "Kirish kamerasi"
5. **"Save"** / **"Apply"** tugmasini bosing

## 3-qadam — Tekshirish

1. Kamerani bir marta o'chirib-yoqing (yoki quvvatni uzib-ulang)
2. Bir necha soniyadan keyin routerning **Connected Devices**
   ro'yxatida kameraning IP manzili **o'zgarmaganini** tasdiqlang
3. Brauzerda kameraning URL manzilini oching
   (masalan `http://192.168.1.100:8081/video`) — tasvir
   ochilishi kerak

## 4-qadam — `s-agent` ni sozlash

Endi shu doimiy IP manzillarni `s-agent/.env` fayliga yozing:

```env
CAMERA_ENTRY_URL=http://192.168.1.100:8081/video
CAMERA_EXIT_URL=http://192.168.1.101:8081/video
```

Shundan keyin `s-agent` ni qayta ishga tushiring.

## Ikkita kamera bo'lsa

Agar stoyankada kirish va chiqish uchun 2 ta alohida kamera bo'lsa,
yuqoridagi 1–3-qadamlarni **har bir kamera uchun alohida** takrorlang
— ikkalasiga ham alohida doimiy IP belgilang (masalan `.100` va
`.101`), ikkalasi ham bir xil bo'lib qolmasligi kerak.

## Muhim eslatmalar

- Bu sozlash **faqat bir marta**, stoyanka o'rnatilganda qilinadi.
- Agar kelajakda router almashtirilsa yoki qayta o'rnatilsa
  (factory reset), bu sozlamani qayta bajarish kerak bo'ladi.
- Turli router brendlarida (TP-Link, Xiaomi, Asus, Huawei, va h.k.)
  menyu nomlari va joylashuvi biroz farq qilishi mumkin, lekin
  mantiq — MAC manzilga IP "biriktirish" — barchasida bir xil.