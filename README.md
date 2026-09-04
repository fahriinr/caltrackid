# 🥗 NutriBot - Telegram AI Calorie Tracker

NutriBot adalah bot Telegram cerdas yang memantau asupan kalori dan nutrisi harian pengguna secara otomatis menggunakan multimodal vision dari **Google Gemini 2.5 Flash** (`@google/genai`).

---

## ✨ Fitur Utama

1. **Onboarding & Profil Fisik Interaktif (`/start`)**
   - Finite State Machine (FSM) untuk registrasi bertahap (Jenis Kelamin, Umur, Tinggi Badan, Berat Badan).
   - Perhitungan otomatis **BMI (Body Mass Index)**, status tubuh (Underweight, Ideal, Overweight, Obesitas), **BMR (Mifflin-St Jeor)**, dan **TDEE**.
   - Rekomendasi target kalori harian yang dapat dikonfirmasi atau disesuaikan mandiri oleh pengguna.

2. **Pencatatan Makanan Otomatis via Foto (Multimodal AI Input)**
   - Cukup kirimkan foto makanan / minuman ke bot.
   - Opsi menambahkan catatan porsi atau klik tombol `[ ⏭️ Lewati / Skip ]`.
   - Analisis otomatis dengan **Gemini 2.5 Flash** yang menghasilkan:
     - Nama menu utama
     - Deskripsi porsi
     - Estimasi kalori (kkal)
     - Makronutrisi (Protein, Karbohidrat, Lemak dalam gram)
     - Catatan nutrisi AI
     - Progres kalori hari ini vs target harian

3. **Cek Status & Rekap Real-Time (`/today`)**
   - Agregasi seluruh makanan yang dikonsumsi hari ini berdasarkan zona waktu pengguna (`Asia/Jakarta`).
   - Rincian total kalori, makronutrisi, serta status sisa kuota kalori atau kelebihan kalori.

4. **Profil & Target Kalori (`/profile` & `/settarget`)**
   - Menampilkan ringkasan data fisik, BMI, BMR, TDEE, dan target kalori aktif.
   - Kemudahan memperbarui target kalori kapan saja dengan `/settarget <jumlah>`.

5. **Rekap Harian Otomatis (@ 21:00 WIB)**
   - Cron job terjadwal setiap pukul 21:00 WIB untuk mengirimkan laporan evaluasi asupan harian kepada seluruh pengguna aktif.

---

## 🛠️ Tech Stack

- **Runtime:** Node.js (v20+ LTS) / TypeScript (ESM)
- **Telegram Bot Framework:** [Grammy.js](https://grammy.dev/)
- **AI Vision Engine:** [Google Gen AI SDK](https://www.npmjs.com/package/@google/genai) (`gemini-2.5-flash`) dengan Structured JSON Schema
- **Database & ORM:** SQLite via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) & [Drizzle ORM](https://orm.drizzle.team/)
- **Cron Scheduler:** `node-cron`
- **Timezone Management:** `luxon`
- **Validation:** `zod`
- **Testing:** `vitest`
- **Deployment:** Docker & Docker Compose

---

## 📋 Struktur Direktori

```text
caltrack/
├── src/
│   ├── bot/
│   │   ├── handlers/
│   │   │   ├── help.handler.ts       # Handler /help & /cancel
│   │   │   ├── photo.handler.ts      # Multimodal food logging & Gemini analysis
│   │   │   ├── profile.handler.ts    # /profile & /settarget handlers
│   │   │   ├── start.handler.ts      # Onboarding & FSM flow
│   │   │   └── today.handler.ts      # /today daily recap handler
│   │   ├── middlewares/
│   │   │   └── throttle.middleware.ts# Anti-spam rate limiting
│   │   └── bot.ts                    # Grammy bot setup & routing
│   ├── config/
│   │   └── env.ts                    # Environment variable validation with Zod
│   ├── cron/
│   │   └── recap.cron.ts             # 21:00 WIB daily recap scheduler
│   ├── db/
│   │   ├── index.ts                  # SQLite / Drizzle connection
│   │   ├── migrate.ts                # Auto-migration runner
│   │   └── schema.ts                 # Users, FoodLogs, and Sessions schemas
│   ├── repositories/
│   │   ├── food-log.repository.ts    # Food logs queries & aggregations
│   │   ├── session.repository.ts     # FSM transient session state management
│   │   └── user.repository.ts        # User profile queries & mutations
│   ├── services/
│   │   ├── gemini.service.ts         # Gemini 2.5 Flash multimodal vision client
│   │   └── nutrition.service.ts      # BMI, BMR, TDEE, & calorie logic
│   ├── utils/
│   │   ├── date.ts                   # Timezone & date utilities (Asia/Jakarta)
│   │   └── telegram.ts               # Telegram photo download buffer helper
│   └── index.ts                      # Application main entrypoint
├── tests/                            # Unit & integration tests (Vitest)
├── Dockerfile                        # Multi-stage production container
├── docker-compose.yml                # Docker compose configuration
├── drizzle.config.ts                 # Drizzle configuration
├── package.json
└── tsconfig.json
```

---

## 🚀 Panduan Instalasi & Menjalankan Bot

### 1. Prasyarat
- Node.js v20+ atau Docker
- Telegram Bot Token dari [@BotFather](https://t.me/BotFather)
- Google Gemini API Key dari [Google AI Studio](https://aistudio.google.com/)

### 2. Salin & Isi File `.env`
Salin file `.env.example` menjadi `.env`:
```bash
cp .env.example .env
```

Lalu edit file `.env`:
```env
TELEGRAM_BOT_TOKEN=isi_dengan_token_bot_telegram_kamu
GEMINI_API_KEY=isi_dengan_gemini_api_key_kamu
DATABASE_URL=./data/nutribot.db
DEFAULT_TIMEZONE=Asia/Jakarta
NODE_ENV=production
```

### 3. Jalankan Secara Lokal

```bash
# Install dependensi
npm install

# Jalankan pengujian (Unit & Integration Tests)
npm test

# Build TypeScript
npm run build

# Jalankan bot
npm start
```

Untuk mode development dengan auto-reload:
```bash
npm run dev
```

---

## 🐳 Menjalankan dengan Docker & Docker Compose

Jalankan container di latar belakang:
```bash
docker-compose up -d --build
```

Cek log container:
```bash
docker-compose logs -f
```

Hentikan container:
```bash
docker-compose down
```

---

## 📱 Daftar Perintah Bot Telegram

| Perintah | Deskripsi |
|---|---|
| `/start` | Memulai bot / pendaftaran profil fisik & target kalori |
| `/today` | Menampilkan rekap asupan kalori & daftar makanan hari ini |
| `/profile` | Menampilkan profil fisik, skor BMI, BMR, TDEE, dan target harian |
| `/settarget <kkal>` | Mengubah target kalori harian secara instan |
| `/help` | Menampilkan panduan lengkap penggunaan bot |
| `/cancel` | Membatalkan input yang sedang aktif |

---

## 🧪 Testing

Project dilengkapi dengan automated testing menggunakan **Vitest**:
```bash
npm test
```
Semua modul kalkulasi nutrisi (BMI/BMR/TDEE), penanganan zona waktu, skema AI Gemini, database repositories, dan simulasi cron broadcast diuji secara komprehensif.
