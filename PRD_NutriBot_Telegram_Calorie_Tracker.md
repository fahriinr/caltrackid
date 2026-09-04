# Product Requirement Document (PRD)

## 1. Project Overview
* **Project Name:** NutriBot (Telegram AI Calorie Tracker)
* **Goal:** Membantu pengguna memantau asupan kalori harian secara otomatis dan intuitif via Telegram menggunakan multimodal vision dari Gemini API.
* **Tech Stack:**
  * **Runtime:** Node.js (v20+ LTS) / TypeScript
  * **Telegram Framework:** Telegraf.js / Grammy.js
  * **AI Engine:** Google Gemini API (`@google/genai` SDK, model: `gemini-2.5-flash`)
  * **Database & ORM:** SQLite / PostgreSQL via Drizzle ORM / Prisma
  * **Cron / Scheduler:** `node-cron`
  * **Deployment:** Docker & Docker Compose

---

## 2. User Personas & Core User Flows

### Flow 1: Onboarding & Profile Setup (`/start`)
1. User menjalankan `/start`.
2. Bot menyapa dan mengecek apakah user sudah terdaftar di database.
3. Jika belum, bot meminta input bertahap (FSM / Conversation flow):
   * Jenis kelamin (L/P via inline button).
   * Umur (tahun).
   * Tinggi Badan (cm).
   * Berat Badan (kg).
4. Bot menghitung:
   * **BMI (Body Mass Index):** $BMI = \frac{\text{BB (kg)}}{(\text{TB (m)})^2}$
   * **BMR & TDEE Standar (Harris-Benedict / Mifflin-St Jeor):** Sebagai rekomendasi awal.
5. Bot menampilkan status tubuh (Underweight, Ideal, Overweight, Obesitas) dan rekomendasi intake harian.
6. Bot meminta user mengonfirmasi atau memasukkan target kalori harian kustom (misal: `2000` kkal).
7. Profil tersimpan, status user diset menjadi `ACTIVE`.

### Flow 2: Food Logging (Multimodal Input)
1. User mengirim foto makanan langsung ke bot.
2. Bot menyimpan `file_id` foto sementara di session cache/database dan mengubah state user ke `AWAITING_FOOD_NOTE`.
3. Bot mengirim pesan:
   > *"Foto diterima! Ada catatan tambahan? (Contoh: 'Ayam bakar dada, nasi 1/2 porsi, es teh tawar')\n\nKetik catatanmu atau tekan tombol **Lewati** jika tidak ada."*
   *(Tersedia Inline Button: `[ Lewati / Skip ]`)*
4. Jika user mengirim teks catatan atau menekan tombol `Lewati`:
   * Bot mengunduh file gambar dari Telegram API (buffer).
   * Backend memanggil Gemini API (`gemini-2.5-flash`) dengan gambar + teks catatan (jika ada).
   * Gemini mengembalikan JSON terstruktur (nutrisi dan estimasi porsi).
5. Bot menyimpan log entri ke tabel `food_logs`.
6. Bot mengirim pesan konfirmasi rincian nutrisi, kalori yang baru dikonsumsi, serta progres kalori hari ini vs batas target.

### Flow 3: Manual Status Check (`/today` atau Menu Button)
1. User klik menu atau ketik `/today`.
2. Bot mengagregasi semua `food_logs` user pada tanggal hari ini (berdasarkan timezone user / default Asia/Jakarta).
3. Bot menampilkan ringkasan:
   * Total Kalori Masuk / Target Kalori.
   * Total Makronutrisi (Protein, Karbohidrat, Lemak).
   * Daftar menu yang dimakan hari ini.
   * Status: *"Aman (Sisa X kkal)"* atau *"Melebihi target sebesar Y kkal"*.

### Flow 4: Automated Daily Recap (Cron Job @ 21:00 WIB)
1. Cron job berjalan setiap hari pukul `21:00` WIB (`0 21 * * *`).
2. Query seluruh user berstatus `ACTIVE`.
3. Untuk setiap user, hitung total kalori hari ini:
   * **Jika $\le$ Target:** *"Bagus! Total asupanmu hari ini X kkal dari target Y kkal. Kamu surplus/defisit aman Z kkal."*
   * **Jika $>$ Target:** *"Perhatian: Hari ini asupanmu X kkal, melebihi target Y kkal sebesar Z kkal."*
4. Sertakan daftar ringkas makanan hari ini.

---

## 3. System Architecture & Database Schema

### Database Schema (Entity-Relationship)

#### Table: `users`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | VARCHAR / BIGINT | PRIMARY KEY | Telegram Chat/User ID |
| `username` | VARCHAR | NULLABLE | Telegram username |
| `gender` | VARCHAR(10) | NOT NULL | 'MALE' / 'FEMALE' |
| `age` | INTEGER | NOT NULL | Umur user |
| `height` | NUMERIC(5,2) | NOT NULL | Tinggi badan (cm) |
| `weight` | NUMERIC(5,2) | NOT NULL | Berat badan (kg) |
| `bmi` | NUMERIC(4,2) | NOT NULL | Skor BMI |
| `daily_calorie_target`| INTEGER | NOT NULL | Batas kalori harian |
| `timezone` | VARCHAR(50) | DEFAULT 'Asia/Jakarta' | Timezone untuk cron |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Waktu registrasi |

#### Table: `food_logs`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID / SERIAL | PRIMARY KEY | Unique log ID |
| `user_id` | BIGINT | REFERENCES users(id) | ID Pemilik log |
| `food_name` | VARCHAR(255) | NOT NULL | Nama hidangan yang dideteksi |
| `portion_description`| TEXT | NULLABLE | Deskripsi porsi (cth: 1/2 porsi nasi) |
| `calories` | INTEGER | NOT NULL | Estimasi total kalori (kkal) |
| `protein` | NUMERIC(6,2) | DEFAULT 0 | Protein (gram) |
| `carbs` | NUMERIC(6,2) | DEFAULT 0 | Karbohidrat (gram) |
| `fat` | NUMERIC(6,2) | DEFAULT 0 | Lemak (gram) |
| `logged_at` | TIMESTAMP | DEFAULT NOW() | Waktu makan |

#### Table: `user_sessions` (Transient State)
| Column | Type | Constraints | Description |
|---|---|---|---|
| `user_id` | BIGINT | PRIMARY KEY | ID User |
| `step` | VARCHAR(50) | NOT NULL | State FSM (e.g. `WAIT_NOTE`) |
| `pending_photo_id` | TEXT | NULLABLE | Telegram `file_id` sementara |
| `updated_at` | TIMESTAMP | DEFAULT NOW() | Last update |

---

## 4. AI & Gemini Integration Specifications

### Model: `gemini-2.5-flash`
Gunakan structured JSON output mode schema (`responseMimeType: "application/json"`) untuk memastikan output selalu konsisten.

### System Prompt
```text
You are an expert clinical dietitian and food calorie estimation assistant.
Your job is to accurately identify food items from images combined with optional user context/notes.

Requirements:
1. Identify all food and beverage components on the plate/scene.
2. Consider user notes (e.g., portion size, specific ingredients, cooking method).
3. If an item is ambiguous, provide the most plausible Indonesian/common nutritional baseline estimate.
4. Output strict JSON matching the schema. Do not include markdown codeblocks or conversational filler.
```

### JSON Response Schema
```json
{
  "food_name": "string (nama ringkas menu utama)",
  "portion_description": "string (ringkasan estimasi porsi)",
  "calories": "integer (total kkal)",
  "macros": {
    "protein_g": "number",
    "carbs_g": "number",
    "fat_g": "number"
  },
  "confidence_note": "string (alasan singkat estimasi)"
}
```

---

## 5. Non-Functional & Security Requirements
1. **Timezone Accuracy:** Semua kalkulasi agregasi harian harus disesuaikan dengan zona waktu lokal pengguna (`Asia/Jakarta` / GMT+7).
2. **Graceful Error Handling:** Jika Gemini API timeout atau gagal mengenali foto makanan, bot harus membalas dengan pesan ramah meminta user memasukkan nama makanan manual atau mengambil foto ulang.
3. **Privacy & Rate Limiting:** Simpan hanya `file_id` atau metadata sementara. Jangan simpan foto mentah di hard drive container untuk menghemat disk space. Terapkan throttle limiter agar user tidak spam foto berturut-turut.
4. **Resilience:** Gunakan restart policy `unless-stopped` pada Docker container agar bot langsung hidup kembali saat server restart.

---

## 6. Docker Deployment Specs

### `Dockerfile`
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist
CMD ["node", "dist/index.js"]
```

### `docker-compose.yml`
```yaml
version: '3.8'

services:
  nutribot:
    build: .
    container_name: telegram-calorie-bot
    restart: unless-stopped
    environment:
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - DATABASE_URL=${DATABASE_URL}
      - TZ=Asia/Jakarta
    volumes:
      - ./data:/app/data
```

---

## 7. Implementation Checklist for Agentic AI
* [ ] Inisialisasi project TypeScript Node.js dengan ESM.
* [ ] Setup schema database SQLite/Postgres dan migrasi via Drizzle/Prisma.
* [ ] Buat finite state machine (FSM) session handler untuk alur `/start` (Gender -> Usia -> TB -> BB -> Target Kalori).
* [ ] Implementasi handler foto Telegram + inline button "Lewati".
* [ ] Integrasikan Google Gen AI SDK multimodal call (`gemini-2.5-flash`) dengan structured JSON output.
* [ ] Buat handler command `/today` untuk agregasi data harian.
* [ ] Konfigurasi cron job jam 21:00 WIB via `node-cron` untuk broadcast rekap.
* [ ] Setup `Dockerfile` dan `docker-compose.yml`.