require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express    = require('express');
const path       = require('path');
const cors       = require('cors');
const fs         = require('fs');

const TOKEN           = process.env.BOT_TOKEN;
const GAME_SHORT_NAME = process.env.GAME_SHORT_NAME || 'terapiya_quiz';
const GAME_URL        = process.env.GAME_URL        || 'http://localhost:3000/game.html';
const PORT            = parseInt(process.env.PORT   || '3000', 10);

if (!TOKEN) { console.error('BOT_TOKEN yo\'q!'); process.exit(1); }

const bot = new TelegramBot(TOKEN, { polling: true });
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const ALL_QUESTIONS = JSON.parse(fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8'));

// sessions[chatId] = { messageId, users: { userId: name } }
const sessions = {};

function getOrCreateChat(chatId) {
  if (!sessions[chatId]) sessions[chatId] = { messageId: null, users: {} };
  return sessions[chatId];
}

async function fetchHighScores(chatId, messageId, anyUserId) {
  try {
    return await bot.getGameHighScores(anyUserId, { chat_id: chatId, message_id: messageId });
  } catch (e) { return []; }
}

function formatLeaderboard(scores, limit = 10) {
  const medals = ['🥇','🥈','🥉'];
  return scores.slice(0, limit).map((e, i) => {
    const name = e.user.first_name + (e.user.last_name ? ' ' + e.user.last_name : '');
    return { position: i+1, userId: e.user.id, name, score: e.score, medal: medals[i] || `${i+1}.` };
  });
}

// Guruhga e'lon xabari yuborish
async function announceToGroup(chatId, playerName, score, leaderboard) {
  try {
    const medals = ['🥇','🥈','🥉'];
    let text = `🏆 *Yangi rekord!*\n\n`;
    text += `👤 *${playerName}* — *${score} ball* to'pladi!\n\n`;
    text += `📊 *Guruh reytingi:*\n`;
    leaderboard.slice(0, 5).forEach((p, i) => {
      const m = medals[i] || `${i+1}.`;
      const isWinner = p.name === playerName;
      text += `${m} ${isWinner ? '*' : ''}${p.name}${isWinner ? '*' : ''} — ${p.score} ball\n`;
    });
    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } catch (e) {
    console.error('announceToGroup error:', e.message);
  }
}

// ── COMMANDS ────────────────────────────────────────────────────────────────

bot.onText(/\/start(@\S+)?$/, async (msg) => {
  const name = msg.from.first_name;
  if (msg.chat.type === 'private') {
    return bot.sendMessage(msg.chat.id,
      `Salom, ${name}! 👋\n\n🏥 *Terapiya Quiz*\n\nGuruhga /quiz yuboring va o'ynang!\n\n*Qoidalar:*\n❤️  3 ta jon\n⏱  20 soniya har savolga\n⚡  Ball = to'g'ri × qolgan soniya × 10\n🏆  Yangi rekord → guruhda e'lon!`,
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
  if (!chat?.messageId) return bot.sendMessage(chatId, '😔 Hali hech kim o\'ynamadi. /quiz bilan boshlang!');
  const anyUser = Object.keys(chat.users)[0];
  if (!anyUser) return bot.sendMessage(chatId, '😔 Hali o\'yinchi yo\'q.');
  const raw = await fetchHighScores(chatId, chat.messageId, anyUser);
  if (!raw.length) return bot.sendMessage(chatId, '😔 Hali ball to\'planmagan.');
  const lb = formatLeaderboard(raw);
  let text = '🏆 *GURUH REYTINGI*\n\n';
  lb.forEach(e => { text += `${e.medal} *${e.name}* — ${e.score} ball\n`; });
  bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
});

bot.onText(/\/help(@\S+)?$/, async (msg) => {
  bot.sendMessage(msg.chat.id,
    `📖 *Qo'llanma*\n\n/quiz — O'yinni boshlash\n/top  — Guruh reytingini ko'rish\n\n*Qoidalar:*\n❤️  3 ta jon\n⏱  Har savolga 20 soniya\n⚡  Ball = to'g'ri × qolgan soniya × 10\n💀  Jonlar tugasa o'yin tugaydi\n🏆  Yangi rekord → guruhda e'lon qilinadi!`,
    { parse_mode: 'Markdown' }
  );
});

// ── SEND GAME MESSAGE ────────────────────────────────────────────────────────

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
    const chat     = getOrCreateChat(chatId);
    chat.messageId = sent.message_id;
    return sent;
  } catch (e) { console.error('sendGame error:', e.message); }
}

// ── INLINE QUERY ─────────────────────────────────────────────────────────────

bot.on('inline_query', async (query) => {
  try {
    await bot.answerInlineQuery(query.id, [
      { type: 'game', id: '1', game_short_name: GAME_SHORT_NAME }
    ]);
  } catch (e) { console.error('inline_query error:', e.message); }
});

// ── CALLBACK QUERIES ─────────────────────────────────────────────────────────

bot.on('callback_query', async (query) => {
  const userId = query.from.id;
  const name   = query.from.first_name + (query.from.last_name ? ' ' + query.from.last_name : '');
  const chatId = query.message?.chat?.id;
  const msgId  = query.message?.message_id;

  // Inline mode
  if (query.inline_message_id && query.game_short_name === GAME_SHORT_NAME) {
    const url = `${GAME_URL}?userId=${userId}&inlineMsgId=${encodeURIComponent(query.inline_message_id)}&name=${encodeURIComponent(name)}&chatId=inline`;
    await bot.answerCallbackQuery(query.id, { url });
    return;
  }

  // Oddiy o'yin
  if (query.game_short_name === GAME_SHORT_NAME) {
    if (chatId && msgId) {
      const chat = getOrCreateChat(chatId);
      chat.messageId     = msgId;
      chat.users[userId] = name;
    }
    const url = `${GAME_URL}?chatId=${chatId}&userId=${userId}&msgId=${msgId}&name=${encodeURIComponent(name)}`;
    await bot.answerCallbackQuery(query.id, { url });
    return;
  }

  // Reyting tugmasi
  if (query.data?.startsWith('top:')) {
    const cId  = parseInt(query.data.split(':')[1], 10);
    const chat = sessions[cId];
    if (!chat?.messageId || !Object.keys(chat.users).length) {
      await bot.answerCallbackQuery(query.id, { text: '😔 Hali hech kim o\'ynamadi!', show_alert: true });
      return;
    }
    const raw = await fetchHighScores(cId, chat.messageId, Object.keys(chat.users)[0]);
    if (!raw.length) {
      await bot.answerCallbackQuery(query.id, { text: '😔 Hali ball to\'planmagan!', show_alert: true });
      return;
    }
    const lb = formatLeaderboard(raw, 5);
    let text = '🏆 TOP O\'YINCHILAR:\n\n';
    lb.forEach(e => { text += `${e.medal} ${e.name} — ${e.score} ball\n`; });
    await bot.answerCallbackQuery(query.id, { text, show_alert: true });
    return;
  }

  await bot.answerCallbackQuery(query.id);
});

// ── REST API ─────────────────────────────────────────────────────────────────

app.get('/api/questions', (_req, res) => {
  const shuffled = [...ALL_QUESTIONS].sort(() => Math.random() - 0.5);
  res.json(shuffled);
});

app.get('/api/scores/:chatId', async (req, res) => {
  const chatId = parseInt(req.params.chatId, 10);
  const chat   = sessions[chatId];
  if (!chat?.messageId) return res.json([]);
  const users = Object.keys(chat.users);
  if (!users.length) return res.json([]);
  const raw = await fetchHighScores(chatId, chat.messageId, users[0]);
  res.json(formatLeaderboard(raw));
});

app.post('/api/scores', async (req, res) => {
  const { chatId, userId, msgId, inlineMsgId, name, score } = req.body;
  if (!userId || score === undefined) return res.status(400).json({ error: 'Missing fields' });

  const scoreInt = Math.max(0, Math.floor(Number(score)));
  const uId      = parseInt(userId, 10);
  const cId      = chatId && chatId !== 'inline' ? parseInt(chatId, 10) : null;
  const mId      = msgId ? parseInt(msgId, 10) : null;

  let isNewRecord = false;
  let leaderboard = [];

  // Avvalgi ball
  let prevScore = 0;
  if (cId && mId) {
    const chat = getOrCreateChat(cId);
    if (mId)  chat.messageId  = mId;
    if (name) chat.users[uId] = name;
    try {
      const prev = await fetchHighScores(cId, mId, uId);
      const me   = prev.find(e => e.user.id === uId);
      if (me) prevScore = me.score;
    } catch(e) {}
  }

  try {
    if (inlineMsgId) {
      await bot.setGameScore(uId, scoreInt, { inline_message_id: inlineMsgId, force: false });
      isNewRecord = true;
    } else if (cId && mId) {
      await bot.setGameScore(uId, scoreInt, { chat_id: cId, message_id: mId, force: false, disable_edit_message: false });
      isNewRecord = true;
    }
  } catch (e) {
    if (e.response?.body?.error_code !== 400) console.error('setGameScore error:', e.message);
    isNewRecord = false;
  }

  // Leaderboard olish
  let prevTopScore = 0;
  if (cId && mId) {
    const chat  = sessions[cId];
    const users = chat ? Object.keys(chat.users) : [];
    if (users.length) {
      const rawNow = await fetchHighScores(cId, mId, users[0]);
      leaderboard  = formatLeaderboard(rawNow);
      // 1-o'rindagi ball (yangilashdan keyingi)
      prevTopScore = leaderboard[0]?.score || 0;
    }
  }

  // Guruhga e'lon — FAQAT guruh umumiy rekordi yangilanganda
  // Ya'ni bu o'yinchi leaderboard da 1-o'rinda va oldingi top balldan yuqori
  const myRankNow = leaderboard.findIndex(e => String(e.userId) === String(uId));
  const isGroupRecord = isNewRecord && cId &&
                        myRankNow === 0 &&
                        leaderboard.length > 0 &&
                        scoreInt > (prevTopScore || 0);
  if (isGroupRecord) {
    await announceToGroup(cId, name, scoreInt, leaderboard);
  }

  const myRank = leaderboard.findIndex(e => String(e.userId) === String(uId)) + 1;
  res.json({ success: true, isNewRecord, leaderboard, myRank });
});

// ── START ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n✅  Server  → http://localhost:${PORT}`);
  console.log(`🎮  Game   → ${GAME_URL}`);
  console.log(`🤖  Bot    → polling started\n`);
});
