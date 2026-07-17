module.exports = {
  apps: [
    {
      name: 's-agent',
      script: './dist/index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      // Qulab tushsa PM2 uni avtomatik qayta ko'taradi. Ketma-ket tez-tez
      // qulasa (masalan .env noto'g'ri sozlangan bo'lsa), kutish vaqti
      // eksponensial oshib boradi (3s dan boshlab) — CPU'ni band qilmasdan,
      // lekin HECH QACHON butunlay "voz kechmaydi" (max_restarts yetarlicha
      // katta, chunki bu kunlik nazoratsiz ishlaydigan tizim).
      exp_backoff_restart_delay: 3000,
      max_restarts: 100,
      // s-agent SIGTERM kelganda o'zi graceful shutdown qiladi (barcha
      // oqimlarni to'xtatib, Live View ulanishlarini yopib, so'ng chiqadi) —
      // bu jarayon index.ts'dagi SHUTDOWN_SAFETY_TIMEOUT_MS'ga ko'ra
      // 18 soniyagacha (BACKEND_REQUEST_TIMEOUT_MS + 3s) davom etishi
      // mumkin. PM2'ning standart kill_timeout (1.6s) juda qisqa bo'lardi
      // va bizni yarim yo'lda SIGKILL bilan majburan o'ldirib qo'yardi —
      // shu sabab SHUTDOWN_SAFETY_TIMEOUT_MS'dan SEZILARLI KATTA qilib
      // oshirilgan (aks holda in-flight backend so'rovi navbatga ulgurmay
      // process majburan o'ldirilib, hodisa yo'qolib qolishi mumkin edi).
      kill_timeout: 20000,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
