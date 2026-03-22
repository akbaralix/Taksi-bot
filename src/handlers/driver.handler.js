import User from "../models/User.js";
import startHandler from "./start.handler.js";
import { Markup } from "telegraf";
import { sendNearestPendingOrdersToDriver } from "./client.handler.js";

function formatTimeLeft(milliseconds) {
  if (milliseconds <= 0) return "0 minut";

  const totalMinutes = Math.floor(milliseconds / (1000 * 60));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  const parts = [];
  if (days > 0) parts.push(`${days} kun`);
  if (hours > 0) parts.push(`${hours} soat`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes} minut`);

  return parts.join(" ");
}

async function checkAndGetDriver(telegramId, ctx = null) {
  const user = await User.findOne({ telegramId });
  if (!user) return null;

  const now = new Date();

  if (user.subscriptionUntil && user.subscriptionUntil < now) {
    user.balance = 0;
    user.isOnline = false;
    user.subscriptionUntil = null;
    await user.save();

    if (ctx) {
      try {
        await ctx.reply(
          "⚠️ Obuna muddati tugaganligi sababli hisobingiz nolga tushirildi.",
        );
      } catch (err) {
        console.error("Xabar yuborishda xatolik:", err);
      }
    }
  }

  return user;
}

function driverKeyboard() {
  return Markup.keyboard([
    ["📴 Ishni yakunlash", "👤 Hisobim"],
    [Markup.button.locationRequest("📍 Lokatsiyani yangilash")],
    ["⬅️ Orqaga"],
  ]).resize();
}

export default async function driverHandler(ctx) {
  const telegramId = ctx.from.id;

  try {
    const user = await checkAndGetDriver(telegramId, ctx);

    if (!user) {
      return startHandler(ctx);
    }

    if (user.balance <= 0) {
      return ctx.reply(
        `🚫🚕 <b>Haydovchi rejimi yopiq!</b>\n\n` +
          `💳 <b>Balansingiz yetarli emas</b>\n\n` +
          `💰 <b>Balans:</b> 0 so'm\n\n` +
          `⚠️ <i>Haydovchi rejimini yoqish uchun hisobni to'ldiring.</i>`,
        {
          parse_mode: "HTML",
          ...Markup.keyboard([
            ["💳 Hisobni to'ldirish"],
            ["⬅️ Orqaga"],
          ]).resize(),
        },
      );
    }

    user.role = "driver";
    user.isOnline = true;
    await user.save();

    const timeLeftMs = user.subscriptionUntil
      ? user.subscriptionUntil - new Date()
      : 0;

    await ctx.reply(
      `✅ <b>Siz endi haydovchi rejimidasiz!</b>\n\n` +
        `📊 <b>Status:</b> 🟢 Onlayn\n` +
        `🕒 <b>Obuna:</b> ${formatTimeLeft(timeLeftMs)} qoldi\n` +
        `💰 <b>Balans:</b> ${user.balance.toLocaleString()} so'm`,
      {
        parse_mode: "HTML",
        ...driverKeyboard(),
      },
    );

    if (!user.location?.latitude || !user.location?.longitude) {
      await ctx.reply(
        "📍 Eng yaqin buyurtmalarni olish uchun joriy lokatsiyangizni yuboring.",
      );
      return;
    }

    const sentCount = await sendNearestPendingOrdersToDriver(ctx.telegram, user);
    if (sentCount > 0) {
      await ctx.reply(
        `📨 Sizga yaqin bo'lgan ${sentCount} ta kutilayotgan buyurtma yuborildi.`,
      );
    }
  } catch (err) {
    console.error("DriverHandler Error:", err);
    await ctx.reply("Xatolik yuz berdi.");
  }
}

export async function stopDriverWork(ctx) {
  try {
    await User.findOneAndUpdate(
      { telegramId: ctx.from.id },
      { isOnline: false },
    );

    await ctx.reply(
      "✅ Ishni yakunladingiz.\n\n📊 Status: 🔴 Oflayn",
      Markup.keyboard([
        ["🚕 Haydovchi rejimini yoqish"],
        ["⬅️ Asosiy menyu"],
      ]).resize(),
    );
  } catch (error) {
    console.error("StopDriver Error:", error);
  }
}

export async function showMyAccount(ctx) {
  try {
    const user = await checkAndGetDriver(ctx.from.id);
    const balance = user?.balance || 0;
    const now = new Date();

    let expiryText = "❌ Aktiv emas";
    if (user?.subscriptionUntil && user.subscriptionUntil > now) {
      expiryText = formatTimeLeft(user.subscriptionUntil - now);
    }

    await ctx.reply(
      `👤 <b>Shaxsiy hisob:</b>\n\n` +
        `🆔 <b>ID:</b> <code>${ctx.from.id}</code>\n` +
        `💰 <b>Balans:</b> ${balance.toLocaleString()} so'm\n` +
        `📅 <b>Obuna tugashiga:</b> ${expiryText} qoldi\n` +
        `📊 <b>Status:</b> ${user?.isOnline ? "🟢 Onlayn" : "🔴 Oflayn"}\n\n` +
        `<i>💡 Eslatma: Obuna tugashi bilan balans nolga tushadi.</i>`,
      {
        parse_mode: "HTML",
        ...Markup.keyboard([
          ["💳 Hisobni to'ldirish"],
          [Markup.button.locationRequest("📍 Lokatsiyani yangilash")],
          ["⬅️ Asosiy menyu"],
        ]).resize(),
      },
    );
  } catch (error) {
    console.error("ShowAccount Error:", error);
  }
}
