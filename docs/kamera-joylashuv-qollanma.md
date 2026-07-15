# Kamerani to'g'ri joylashtirish — nomer aniqlash aniqligi uchun

Bu qo'llanma — kamerani stoyankada jismonan o'rnatishda rioya
qilinishi kerak bo'lgan qoidalar. Bu kod emas, balki kamerani
o'rnatuvchi shaxs (stoyanka egasi yoki texnik xodim) uchun
amaliy maslahat.

## Nima uchun muhim

OCR (nomer aniqlash tizimi) bir vaqtning o'zida FAQAT bitta
rasmni tahlil qiladi. Agar kamera juda keng burchakda yoki
uzoqdan o'rnatilgan bo'lsa, bitta rasmda BIR NECHTA mashina
birga tushib qolishi mumkin — bu OCR ni chalkashtirib, noto'g'ri
yoki umuman aniqlanmagan natijaga olib kelishi mumkin.

## To'g'ri o'rnatish qoidalari

### 1. Kamera darvoza/shlagbaum yoniga, YAQIN joylashtirilsin

```
❌ NOTO'G'RI: Kamera uzoqdan, butun yo'lakni yoki
   stoyanka maydonini ko'radigan qilib o'rnatilgan
   → Bir vaqtda bir nechta mashina rasmga tushishi mumkin

✅ TO'G'RI: Kamera darvoza tepasida yoki yonida,
   FAQAT "hozir shu nuqtada turgan bitta mashina"ni
   ko'radigan tor burchakda o'rnatilgan
```

### 2. Balandlik va burchak

- Kamera mashina old (yoki orqa) nomer plastinkasi
  balandligiga yaqin joylashtirilishi tavsiya etiladi
  (odatda yerdan 0.5-1.5 metr balandlik)
- Kamera to'g'ridan-to'g'ri nomerga qaragan holda
  (juda keskin burchakdan emas) o'rnatilishi kerak

### 3. Yoritish

- Tungi vaqtda ham nomer aniq ko'rinishi uchun,
  kamera yaqinida yetarli yorug'lik (masalan LED
  chiroq) bo'lishi tavsiya etiladi
- Quyosh nurlari to'g'ridan-to'g'ri kamera obyektiviga
  tushmasligi kerak (kunduzi "yorqinlik bloklanishi"
  oldini olish uchun)

### 4. Bir vaqtda bitta mashina

- Kirish/chiqish yo'lagi shunday loyihalanishi kerakki,
  bir vaqtning o'zida faqat BITTA mashina kamera
  "ko'rish maydonida" turishi mumkin bo'lsin
- Agar navbat uzun bo'lsa, orqadagi mashinalar ORQA
  fonda, lekin OCR e'tiborini chalg'itmaydigan
  masofada turishi kerak

### 5. Ikkita kamera bo'lsa (kirish + chiqish)

- Har ikkala kamera BIR-BIRIDAN yetarlicha uzoqda
  o'rnatilishi kerak, shunda ular bir-birining
  ko'rish maydoniga xalaqit bermaydi
- Har biri faqat O'Z tomonidagi mashinani ko'rishi
  kerak (kirish kamerasi chiqayotgan mashinani
  "chalg'ituvchi fonda" ko'rmasligi kerak)

## Test qilish

Kamera o'rnatilgandan keyin, real mashina bilan bir necha
marta sinab ko'ring:
1. Mashinani darvoza oldiga to'xtating
2. Operator Dashboard dagi live-view orqali nomer aniq
   ko'rinishini tekshiring
3. Agar OCR bir necha marta ketma-ket nomerni aniqlay
   olmasa — kamera burchagi yoki masofasini qayta sozlang
