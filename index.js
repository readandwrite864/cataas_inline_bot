import TelegramBot from "node-telegram-bot-api";
import express from "express";

const TOKEN = process.env.TG_BOT_KEY;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const DEBUG = process.env.DEBUG === "true";
const BASE_URL = "https://cataas.com";
const bot = new TelegramBot(TOKEN, { webHook: true });
bot.setWebHook(`${WEBHOOK_URL}/bot${TOKEN}`);

// Per-user debounce storage
const userTimers = new Map();
const DEBOUNCE_TIME = 500; // ms

const tags = {
  list: [],
  updated_at: 0,
  async sample() {
    const all = await tags.get();
    return all[Math.floor(Math.random() * all.length)];
  },
  async get() {
    if (Date.now() - tags.updated_at > 1000 * 60 * 60) {
      tags.list = await fetch(`${BASE_URL}/api/tags`)
        .then((r) => r.json())
        .then((v) => v.filter(Boolean));
      tags.updated_at = Date.now();
    }

    return tags.list;
  },
};

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  if (DEBUG) {
    console.log(`/start from ${chatId}`);
  }

  bot.sendMessage(
    chatId,
    "Here are all available tags:\n" + "cataas.com/api/tags" + "\n\nUpload your cat!\ncataas.com/upload\n"
  );
});

bot.on("inline_query", (query) => {
  const userId = query.from.id;

  if (DEBUG) {
    console.log(`inline_query from ${userId}`);
  }

  if (userTimers.has(userId)) {
    clearTimeout(userTimers.get(userId));
  }

  const timer = setTimeout(() => {
    handleInlineQuery(query);
    userTimers.delete(userId);
  }, DEBOUNCE_TIME);

  userTimers.set(userId, timer);
});

async function handleInlineQuery(inlineQuery) {
  const text = inlineQuery.query.trim();
  let apiUrl = `${BASE_URL}/cat`;
  let title = "Random Cat";
  let cleanTag;

  if (text) {
    if (text.startsWith("/")) {
      const [tag] = text.split(/\s/);
      cleanTag = tag.replace("/", "").trim();
      const sayText = text.replace(tag, "").trim();
      const textAsURI = encodeURIComponent(sayText);
      apiUrl = `${BASE_URL}/cat/${cleanTag}`;
      if (Boolean(sayText)) apiUrl += `/says/${textAsURI}`;
    } else {
      apiUrl = `${BASE_URL}/cat/says/${encodeURIComponent(text)}`;
    }
  }

  // cache-bust because same url, random image
  const finalUrl = `${apiUrl}?ts=${Date.now()}`;

  const results = [
    cleanTag === "gif"
      ? {
          id: Math.random().toString(36).substring(2),
          type: "gif",
          gif_url: finalUrl,
          thumb_url: finalUrl,
          title: title,
        }
      : {
          id: Math.random().toString(36).substring(2),
          type: "photo",
          photo_url: finalUrl,
          thumb_url: finalUrl,
          title: title,
        },
  ];

  try {
    await bot.answerInlineQuery(inlineQuery.id, results, {
      cache_time: 0,
      switch_pm_text: `Try: '/${await tags.sample()} hello' or '/gif hello' or 'hello'.`,
      switch_pm_parameter: "help",
    });
  } catch (error) {
    console.error("Inline Query Error:", error.message);
  }
}

const app = express();
app.use(express.json());
app.post(`/bot${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Bot server running on port ${port}`);
});
