# Stoyanka kompyuterida vaqt sinxronizatsiyasi (NTP)

Bu qo'llanma — s-agent ishlaydigan stoyanka kompyuterida to'g'ri
vaqt sozlangan bo'lishini ta'minlash bo'yicha. Bu kod emas, balki
kompyuterni sozlashda bajariladigan amaliy qadam.

## Nima uchun muhim

s-agent mashina kirish/chiqish vaqtini (`captured_at`) o'zining
kompyuter soatidan oladi. Agar bu soat noto'g'ri bo'lsa (masalan,
kompyuter uzoq vaqt internetga ulanmagan, yoki qo'lda noto'g'ri
sozlangan bo'lsa):

- Mashina turish davomiyligi noto'g'ri hisoblanishi mumkin
- Bu esa noto'g'ri to'lov summasiga olib kelishi mumkin
  (garchi tizimda "anomaliya himoyasi" bo'lsa ham — bu himoya
  faqat ENG YOMON holatni, manfiy vaqtni, oldini oladi, lekin
  "biroz noto'g'ri" vaqtni tuzatmaydi)

## Yechim — avtomatik vaqt sinxronizatsiyasi

Zamonaviy operatsion tizimlarning barchasida (Windows, macOS,
Linux) avtomatik vaqt sinxronizatsiyasi (NTP — Network Time
Protocol) mavjud va odatda STANDART holda YOQILGAN bo'ladi.
Stoyanka kompyuterini sozlashda buni albatta TEKSHIRIB chiqish
kerak.

### Windows

1. **Sozlamalar** → **Vaqt va til** → **Sana va vaqt**
2. "Vaqtni avtomatik sozlash" — **YOQILGAN** ekanligini
   tekshiring
3. Agar kerak bo'lsa, "Hozir sinxronlash" tugmasini bosing

### macOS

1. **System Settings** → **General** → **Date & Time**
2. "Set date and time automatically" — belgilangan
   (checked) bo'lishi kerak

### Linux (Ubuntu va boshqalar)

Terminalda tekshirish:

```bash
timedatectl status
```

Agar `NTP service: inactive` yoki `System clock synchronized: no`
ko'rinsa, yoqish:

```bash
sudo timedatectl set-ntp true
```

## Tekshirish

Kompyuterning joriy vaqtini telefon yoki boshqa ishonchli manba
bilan solishtiring — ular bir necha soniyadan ortiq farq
qilmasligi kerak.

## Muhim eslatma

Bu sozlash — stoyanka kompyuterini birinchi marta o'rnatishda
BIR MARTA tekshiriladi. Internet aloqasi barqaror bo'lsa, keyin
alohida e'tibor talab qilmaydi — operatsion tizim o'zi doimiy
ravishda vaqtni internetdagi ishonchli serverlar bilan
sinxronlashtirib turadi.
