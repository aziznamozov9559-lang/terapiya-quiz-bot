# 🏥 Terapiya Quiz Bot

Telegram guruh uchun tibbiyot testi o'yini.
318 ta savol · 3 jon · 10 soniya timer · Telegram native scoreboard.

---

## Qanday ishlaydi?

```
Foydalanuvchi /quiz → Bot sendGame() → Telegram game xabari
→ "O'yinni boshlash" bosiladi → HTML5 o'yin ochiladi
→ O'yin tugaydi → server setGameScore() chaqiradi
→ Telegram o'zi:
    1. Scoreboard'ni yangilaydi (game xabari ostida)
    2. Yangi rekord bo'lsa guruhga SERVICE MESSAGE yuboradi
       (xuddi "User guruhga qo'shildi" kabi kulrang markaziy xabar)
```

Ballar **Telegram serverida saqlanadi** — tashqi database kerak emas.

---

## O'rnatish

### 1. Bot va o'yin yaratish

**BotFather** da:
```
/newbot          → bot yarating, TOKEN oling
/newgame         → botingizni tanlang
                   Title:      Terapiya Quiz
                   Short name: terapiya_quiz
                   Tavsif va rasm qo'shing
```

### 2. Serverga deploy qilish

**Railway (tavsiya, bepul):**
1. https://railway.app → GitHub bilan kiring
2. "New Project" → "Deploy from GitHub repo"
3. Settings → "Generate Domain" → HTTPS manzil oling

### 3. .env sozlash

```env
BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrSTUVwxyz
GAME_SHORT_NAME=terapiya_quiz
GAME_URL=https://your-app.railway.app/game.html
PORT=3000
```

### 4. Ishga tushirish

```bash
npm install
cp .env.example .env
# .env ni tahrirlang
node bot.js
```

---

## Loyiha tuzilmasi

```
quiz-bot/
├── bot.js              ← Bot + Express server
├── questions.json      ← 318 ta savol
├── .env.example
├── package.json
└── public/
    ├── game.html       ← HTML5 o'yin
    └── index.html      ← Redirect
```

---

## Bot buyruqlari

| Buyruq | Tavsif |
|--------|--------|
| `/quiz` | O'yinni guruhga yuborish |
| `/top`  | Guruh reytingini ko'rish |
| `/help` | Qoidalar |

---

## O'yin qoidalari

| | |
|--|--|
| ❤️ Jonlar | 3 ta |
| ⏱ Vaqt | 10 soniya / savol |
| ⚡ Ball | to'g'ri × qolgan soniya × 10 |
| 🎯 Sessiya | 20 ta savol (318 dan random) |
| 🏆 Rekord | Telegram avtomatik service message yuboradi |
