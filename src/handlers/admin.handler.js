import { Markup } from "telegraf";
import User from "../models/User.js";
import adminKeyboard from "../keyboards/admin.keyboard.js";
import { safeCopyMessage } from "../services/telegram.service.js";
import { BUTTONS } from "../config/text.js";

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

  return ctx.reply("\uD83D\uDEE0 <b>Admin panel</b>\n\nKerakli bo'limni tanlang.", {
    parse_mode: "HTML",
    reply_markup: adminKeyboard,
  });
}

async function showActiveUsers(ctx) {
  const activeUsers = await User.countDocuments({ isBlocked: { $ne: true } });
  await ctx.reply(`\uD83D\uDC65 Faol userlar soni: <b>${activeUsers}</b>`, {
    parse_mode: "HTML",
    reply_markup: adminKeyboard,
  });
}

async function showBlockedUsers(ctx) {
  const blockedUsers = await User.countDocuments({ isBlocked: true });
  await ctx.reply(`\uD83D\uDEAB Botni bloklagan userlar soni: <b>${blockedUsers}</b>`, {
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

  await ctx.reply(`\uD83D\uDE95 Faol driverlar soni: <b>${activeDrivers}</b>`, {
    parse_mode: "HTML",
    reply_markup: adminKeyboard,
  });
}

async function askBroadcastTarget(ctx) {
  await ctx.reply("\uD83D\uDCE3 Kimlarga xabar yuborasiz?", {
    ...Markup.inlineKeyboard([
      [Markup.button.callback("\uD83D\uDE4B Yo'lovchilarga", "broadcast_clients")],
      [Markup.button.callback("\uD83D\uDE95 Haydovchilarga", "broadcast_drivers")],
      [Markup.button.callback("\uD83C\uDF10 Hammaga", "broadcast_all")],
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
    "\u2709\uFE0F Endi yuboriladigan xabarni jo'nating.\n\nText, sticker, photo, video yoki boshqa xabar turlari ham yuborishingiz mumkin.",
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
    `\u2705 Xabar yuborish yakunlandi.\n\n` +
      `\uD83D\uDCEC Yuborildi: ${sentCount}\n` +
      `\u26A0\uFE0F Yuborilmadi: ${failedCount}`,
    { reply_markup: adminKeyboard },
  );

  return true;
}

export default function adminHandler(bot) {
  bot.command("admin", async (ctx) => {
    if (!adminOnly(ctx)) return;
    await showAdminMenu(ctx);
  });

  bot.hears(BUTTONS.adminPanel, async (ctx) => {
    if (!adminOnly(ctx)) return;
    await showAdminMenu(ctx);
  });

  bot.hears(BUTTONS.activeUsers, async (ctx) => {
    if (!adminOnly(ctx)) return;
    await showActiveUsers(ctx);
  });

  bot.hears(BUTTONS.blockedUsers, async (ctx) => {
    if (!adminOnly(ctx)) return;
    await showBlockedUsers(ctx);
  });

  bot.hears(BUTTONS.activeDrivers, async (ctx) => {
    if (!adminOnly(ctx)) return;
    await showActiveDrivers(ctx);
  });

  bot.hears(BUTTONS.broadcast, async (ctx) => {
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
