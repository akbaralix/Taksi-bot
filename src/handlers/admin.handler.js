import { Markup } from "telegraf";
import User from "../models/User.js";
import adminKeyboard from "../keyboards/admin.keyboard.js";
import { safeCopyMessage } from "../services/telegram.service.js";

function isAdmin(ctx) {
  return String(ctx.from?.id) === String(process.env.ADMIN_ID);
}

function adminOnly(ctx) {
  if (!isAdmin(ctx)) {
    return false;
  }

  return true;
}

async function showAdminMenu(ctx) {
  await User.findOneAndUpdate(
    { telegramId: ctx.from.id },
    { step: "menu" },
    { upsert: true },
  );

  return ctx.reply("🛠 <b>Admin panel</b>\n\nKerakli bo'limni tanlang.", {
    parse_mode: "HTML",
    reply_markup: adminKeyboard,
  });
}

async function showStats(ctx) {
  const now = new Date();
  const [activeUsers, blockedUsers, activeDrivers] = await Promise.all([
    User.countDocuments({ isBlocked: { $ne: true } }),
    User.countDocuments({ isBlocked: true }),
    User.countDocuments({
      role: "driver",
      isOnline: true,
      subscriptionUntil: { $gt: now },
      isBlocked: { $ne: true },
    }),
  ]);

  await ctx.reply(
    `📊 <b>Bot statistikasi</b>\n\n` +
      `👥 Faol userlar: <b>${activeUsers}</b>\n` +
      `🚫 Botni bloklaganlar: <b>${blockedUsers}</b>\n` +
      `🚕 Faol driverlar: <b>${activeDrivers}</b>`,
    { parse_mode: "HTML", reply_markup: adminKeyboard },
  );
}

async function showActiveUsers(ctx) {
  const activeUsers = await User.countDocuments({ isBlocked: { $ne: true } });
  await ctx.reply(`👥 Faol userlar soni: <b>${activeUsers}</b>`, {
    parse_mode: "HTML",
    reply_markup: adminKeyboard,
  });
}

async function showBlockedUsers(ctx) {
  const blockedUsers = await User.countDocuments({ isBlocked: true });
  await ctx.reply(`🚫 Botni bloklagan userlar soni: <b>${blockedUsers}</b>`, {
    parse_mode: "HTML",
    reply_markup: adminKeyboard,
  });
}

async function showActiveDrivers(ctx) {
  const activeDrivers = await User.countDocuments({
    role: "driver",
    isOnline: true,
    subscriptionUntil: { $gt: new Date() },
    isBlocked: { $ne: true },
  });

  await ctx.reply(`🚕 Faol driverlar soni: <b>${activeDrivers}</b>`, {
    parse_mode: "HTML",
    reply_markup: adminKeyboard,
  });
}

async function askBroadcastTarget(ctx) {
  await ctx.reply("📢 Kimlarga xabar yuborasiz?", {
    ...Markup.inlineKeyboard([
      [Markup.button.callback("🙋 Yo'lovchilarga", "broadcast_clients")],
      [Markup.button.callback("🚕 Haydovchilarga", "broadcast_drivers")],
      [Markup.button.callback("🌐 Hammaga", "broadcast_all")],
    ]),
  });
}

async function setBroadcastMode(ctx, segment) {
  await User.findOneAndUpdate(
    { telegramId: ctx.from.id },
    { step: `admin_broadcast_${segment}` },
    { upsert: true },
  );

  await ctx.answerCbQuery();
  await ctx.reply(
    "✉️ Endi yuboriladigan xabarni jo'nating.\n\nText, sticker, photo, video yoki boshqa xabar turlari ham yuborishingiz mumkin.",
    { reply_markup: adminKeyboard },
  );
}

async function getBroadcastRecipients(segment) {
  const baseFilter = { isBlocked: { $ne: true } };

  if (segment === "clients") {
    return User.find({
      ...baseFilter,
      role: { $ne: "driver" },
    }).select("telegramId");
  }

  if (segment === "drivers") {
    return User.find({
      ...baseFilter,
      role: "driver",
    }).select("telegramId");
  }

  return User.find(baseFilter).select("telegramId");
}

async function handleBroadcastMessage(ctx) {
  if (!isAdmin(ctx) || !ctx.message) {
    return false;
  }

  const adminUser = await User.findOne({ telegramId: ctx.from.id });
  const step = adminUser?.step || "";

  if (!step.startsWith("admin_broadcast_")) {
    return false;
  }

  const segment = step.replace("admin_broadcast_", "");
  const recipients = await getBroadcastRecipients(segment);

  let sentCount = 0;
  let failedCount = 0;

  for (const user of recipients) {
    const copied = await safeCopyMessage(
      ctx.telegram,
      user.telegramId,
      ctx.chat.id,
      ctx.message.message_id,
    ).catch(() => null);

    if (copied) {
      sentCount += 1;
    } else {
      failedCount += 1;
    }
  }

  await User.findOneAndUpdate({ telegramId: ctx.from.id }, { step: "menu" });

  await ctx.reply(
    `✅ Xabar yuborish yakunlandi.\n\n` +
      `📬 Yuborildi: ${sentCount}\n` +
      `⚠️ Yuborilmadi: ${failedCount}`,
    { reply_markup: adminKeyboard },
  );

  return true;
}

export default function adminHandler(bot) {
  bot.command("admin", async (ctx) => {
    if (!adminOnly(ctx)) return;
    await showAdminMenu(ctx);
  });

  bot.hears("🛠 Admin panel", async (ctx) => {
    if (!adminOnly(ctx)) return;
    await showAdminMenu(ctx);
  });

  bot.hears("👥 Faol userlar", async (ctx) => {
    if (!adminOnly(ctx)) return;
    await showActiveUsers(ctx);
  });

  bot.hears("🚫 Botni bloklaganlar", async (ctx) => {
    if (!adminOnly(ctx)) return;
    await showBlockedUsers(ctx);
  });

  bot.hears("🚕 Faol driverlar", async (ctx) => {
    if (!adminOnly(ctx)) return;
    await showActiveDrivers(ctx);
  });

  bot.hears("📢 Xabar yuborish", async (ctx) => {
    if (!adminOnly(ctx)) return;
    await askBroadcastTarget(ctx);
  });

  bot.action("broadcast_clients", async (ctx) => {
    if (!adminOnly(ctx)) return;
    await setBroadcastMode(ctx, "clients");
  });

  bot.action("broadcast_drivers", async (ctx) => {
    if (!adminOnly(ctx)) return;
    await setBroadcastMode(ctx, "drivers");
  });

  bot.action("broadcast_all", async (ctx) => {
    if (!adminOnly(ctx)) return;
    await setBroadcastMode(ctx, "all");
  });

  bot.on("message", async (ctx, next) => {
    const handled = await handleBroadcastMessage(ctx);
    if (handled) {
      return;
    }

    return next();
  });
}
