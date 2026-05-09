require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express    = require('express');
const path       = require('path');
const cors       = require('cors');
const fs         = require('fs');

// ─── CONFIG ────────────────────────────────────────────────────────────────
const TOKEN           = process.env.BOT_TOKEN;
const GAME_SHORT_NAME = process.env.GAME_SHORT_NAME || 'terapiya_quiz';
const GAME_URL        = process.env.GAME_URL        || 'http://localhost:3000/game.html';
const PORT            = parseInt(process.env.PORT   || '3000', 10);

if (!TOKEN) { console.error('❌  BOT_TOKEN .env da yo\'q!'); process.exit(1); }

// ─── BOT ───────────────────────────────────────────────────────────────────
const bot = new TelegramBot(TOKEN, { polling: true });

// ─── EXPRESS ───────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── QUESTIONS ─────────────────────────────────────────────────────────────
const ALL_QUESTIONS = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8')
);

/*
  HOW TELEGRAM NATIVE SCORES WORK
  ────────────────────────────────
  • bot.setGameScore(userId, score, { chat_id, message_id })
      → Telegram stores the score on its own servers
      → If this score > user's previous score, Telegram AUTOMATICALLY
        sends a "service message" in the group chat (grey, centred text,
        same visual style as "User joined" / "User left")
        e.g.  "🏆 Ali just scored 350 in Terapiya Quiz!"
      → The inline scoreboard under the game message is updated too
  • bot.getGameHighScores(userId, { chat_id, message_id })
      → Returns ranked list of all players for that game message
  No external database needed — Telegram IS the database.

  We only keep an in-memory map:  chatId → { messageId, users: {userId→name} }
  This resets on restart but that is fine — scores on Telegram survive restarts.
  The only issue after restart: we won't know which message to query until
  someone plays again (then we re-learn the messageId).
*/

// sessions[chatId] = { messageId, users: { userId: name } }
const sessions = {};

function getOrCreateChat(chatId) {
  if (!sessions[chatId]) sessions[chatId] = { messageId: null, users: {} };
  return sessions[chatId];
}

// ─── HELPER: fetch high scores safely ──────────────────────────────────────
async function fetchHighScores(chatId, messageId, anyUserId) {
  try {
    return await bot.getGameHighScores(anyUserId, {
      chat_id:    chatId,
      message_id: messageId
    });
  } catch (e) {
    return [];
  }
}

function formatLeaderboard(scores, limit = 10) {
  const medals = ['🥇','🥈','🥉'];
  return scores.slice(0, limit).map((e, i) => {
    const name = e.user.first_name + (e.user.last_name ? ' ' + e.user.last_name : '');
    return { position: i+1, userId: e.user.id, name, score: e.score,
             medal: medals[i] || `${i+1}.` };
  });
}

// ─── BOT COMMANDS ──────────────────────────────────────────────────────────

bot.onText(/\/start(@\S+)?$/, async (msg) => {
  const name = msg.from.first_name;
  if (msg.chat.type === 'private') {
    return bot.sendMessage(msg.chat.id,
      `Salom, ${name}! 👋\n\n` +
      `🏥 *Terapiya Quiz*\n\n` +
      `Botni guruhga qo'shing va /quiz yuboring.\n\n` +
      `*Qoidalar:*\n` +
      `❤️  3 ta jon\n` +
      `⏱  10 soniya har savolga\n` +
      `⚡  Ball = to'g'ri × qolgan soniya × 10\n` +
      `🏆  Yangi rekord → guruhda avtomatik e'lon!`,
      { parse_mode: 'Markdown' }
    );
  }
  await sendGameMessage(msg.chat.id);
});

bot.onText(/\/quiz(@\S+)?$/, async (msg) => {
  await sendGameMessage(msg.chat.id);
});

bot.onText(/\/top(@\S+)?$/, async (msg) => {
  const chatId = msg.chat.id;
  const chat   = sessions[chatId];
  if (!chat?.messageId) {
    return bot.sendMessage(chatId,
      '😔 Hali hech kim o\'ynamadi. /quiz bilan boshlang!');
  }
  const anyUser = Object.keys(chat.users)[0];
  if (!anyUser) return bot.sendMessage(chatId, '😔 Hali o\'yinchi yo\'q.');

  const raw = await fetchHighScores(chatId, chat.messageId, anyUser);
  if (!raw.length) return bot.sendMessage(chatId, '😔 Hali ball to\'planmagan.');

  const lb = formatLeaderboard(raw);
  let text  = '🏆 *GURUH REYTINGI*\n\n';
  lb.forEach(e => { text += `${e.medal} *${e.name}* — ${e.score} ball\n`; });
  bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
});

bot.onText(/\/help(@\S+)?$/, async (msg) => {
  bot.sendMessage(msg.chat.id,
    `📖 *Qo'llanma*\n\n` +
    `/quiz — O'yinni boshlash\n` +
    `/top  — Guruh reytingini ko'rish\n\n` +
    `*Qoidalar:*\n` +
    `❤️  3 ta jon — xato yoki vaqt tugasa kamayadi\n` +
    `⏱  Har savolga 10 soniya\n` +
    `⚡  Ball = to'g'ri javob × qolgan soniya × 10\n` +
    `💀  Jonlar tugasa o'yin tugaydi\n` +
    `🏆  Yangi rekord → Telegram guruhga service xabar yuboradi!`,
    { parse_mode: 'Markdown' }
  );
});

// ─── SEND GAME MESSAGE ─────────────────────────────────────────────────────
async function sendGameMessage(chatId) {
  try {
    const sent = await bot.sendGame(chatId, GAME_SHORT_NAME, {
      reply_markup: {
        inline_keyboard: [[
          { text: '🎮  O\'yinni boshlash', callback_game: {} },
          { text: '🏆  Reyting',           callback_data: `top:${chatId}` }
        ]]
      }
    });
    const chat        = getOrCreateChat(chatId);
    chat.messageId    = sent.message_id;
    return sent;
  } catch (e) {
    console.error('sendGame error:', e.message);
  }
}

// ─── CALLBACK QUERIES ──────────────────────────────────────────────────────
bot.on('callback_query', async (query) => {
  const userId = query.from.id;
  const name   = query.from.first_name +
                 (query.from.last_name ? ' ' + query.from.last_name : '');
  const chatId = query.message?.chat?.id;
  const msgId  = query.message?.message_id;

  // ── Game launch ──────────────────────────────────────────────────────────
  if (query.game_short_name === GAME_SHORT_NAME) {
    if (chatId && msgId) {
      const chat = getOrCreateChat(chatId);
      chat.messageId        = msgId;
      chat.users[userId]    = name;
    }
    const url = `${GAME_URL}?chatId=${chatId}&userId=${userId}` +
                `&msgId=${msgId}&name=${encodeURIComponent(name)}`;
    await bot.answerCallbackQuery(query.id, { url });
    return;
  }

  // ── Reyting button ───────────────────────────────────────────────────────
  if (query.data?.startsWith('top:')) {
    const cId  = parseInt(query.data.split(':')[1], 10);
    const chat = sessions[cId];
    if (!chat?.messageId || !Object.keys(chat.users).length) {
      await bot.answerCallbackQuery(query.id,
        { text: '😔 Hali hech kim o\'ynamadi!', show_alert: true });
      return;
    }
    const raw = await fetchHighScores(cId, chat.messageId,
                                      Object.keys(chat.users)[0]);
    if (!raw.length) {
      await bot.answerCallbackQuery(query.id,
        { text: '😔 Hali ball to\'planmagan!', show_alert: true });
      return;
    }
    const lb  = formatLeaderboard(raw, 5);
    let text  = '🏆 TOP O\'YINCHILAR:\n\n';
    lb.forEach(e => { text += `${e.medal} ${e.name} — ${e.score} ball\n`; });
    await bot.answerCallbackQuery(query.id, { text, show_alert: true });
    return;
  }

  await bot.answerCallbackQuery(query.id);
});

// ─── REST API ──────────────────────────────────────────────────────────────

// GET /api/questions  →  full shuffled list
app.get('/api/questions', (_req, res) => {
  const shuffled = [...ALL_QUESTIONS].sort(() => Math.random() - 0.5);
  res.json(shuffled);
});

// GET /api/scores/:chatId  →  leaderboard for the game widget
app.get('/api/scores/:chatId', async (req, res) => {
  const chatId = parseInt(req.params.chatId, 10);
  const chat   = sessions[chatId];
  if (!chat?.messageId) return res.json([]);
  const users  = Object.keys(chat.users);
  if (!users.length) return res.json([]);
  const raw = await fetchHighScores(chatId, chat.messageId, users[0]);
  res.json(formatLeaderboard(raw));
});

// POST /api/scores  →  submit score from game page
app.post('/api/scores', async (req, res) => {
  const { chatId, userId, msgId, name, score } = req.body;
  if (!chatId || !userId || score === undefined)
    return res.status(400).json({ error: 'Missing fields' });

  const scoreInt = Math.max(0, Math.floor(Number(score)));
  const cId      = parseInt(chatId, 10);
  const uId      = parseInt(userId, 10);
  const mId      = parseInt(msgId,  10);

  // Update session
  const chat = getOrCreateChat(cId);
  if (mId)  chat.messageId  = mId;
  if (name) chat.users[uId] = name;

  const effectiveMsgId = chat.messageId;
  if (!effectiveMsgId)
    return res.status(400).json({ error: 'No game message found for this chat' });

  let isNewRecord = false;

  try {
    await bot.setGameScore(uId, scoreInt, {
      chat_id:              cId,
      message_id:           effectiveMsgId,
      force:                false,   // only update if score is higher
      disable_edit_message: false    // let Telegram update the scoreboard
    });
    isNewRecord = true;
    // ↑ If NOT a new record, Telegram throws 400 → caught below
  } catch (e) {
    const errCode = e.response?.body?.error_code;
    const errMsg  = e.response?.body?.description || e.message;
    // 400 "BOT_SCORE_NOT_MODIFIED" → score not higher, that's fine
    if (errCode !== 400) {
      console.error('setGameScore error:', errMsg);
    }
  }

  // Always return current leaderboard
  const users = Object.keys(chat.users);
  const raw   = users.length
    ? await fetchHighScores(cId, effectiveMsgId, users[0])
    : [];
  const leaderboard = formatLeaderboard(raw);
  const myRank      = leaderboard.findIndex(e => String(e.userId) === String(uId)) + 1;

  res.json({ success: true, isNewRecord, leaderboard, myRank });
});

// ─── START ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅  Server   →  http://localhost:${PORT}`);
  console.log(`🎮  Game     →  ${GAME_URL}`);
  console.log(`🤖  Polling  →  started\n`);
});
