import User from "../models/User.js";
import startHandler from "./start.handler.js";
import { Markup } from "telegraf";
import { sendNearestPendingOrdersToDriver } from "./client.handler.js";
import getDriverKeyboard from "../keyboards/driver.keyboard.js";
import { BUTTONS } from "../config/text.js";

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
          "\u26A0\uFE0F Obuna muddati tugaganligi sababli hisobingiz nolga tushirildi.",
        );
      } catch (err) {
        console.error("Xabar yuborishda xatolik:", err);
      }
    }
  }

  return user;
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
        `\uD83D\uDEAB\uD83D\uDE95 <b>Haydovchi rejimi yopiq!</b>\n\n` +
          `\uD83D\uDCB3 <b>Balansingiz yetarli emas</b>\n\n` +
          `\uD83D\uDCB0 <b>Balans:</b> 0 so'm\n\n` +
          `\u26A0\uFE0F <i>Haydovchi rejimini yoqish uchun hisobni to'ldiring.</i>`,
        {
          parse_mode: "HTML",
          ...Markup.keyboard([[BUTTONS.topUp], [BUTTONS.back]]).resize(),
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
      `\u2705 <b>Siz endi haydovchi rejimidasiz!</b>\n\n` +
        `\uD83D\uDCCA <b>Status:</b> \uD83D\uDFE2 Onlayn\n` +
        `\uD83D\uDD52 <b>Obuna:</b> ${formatTimeLeft(timeLeftMs)} qoldi\n` +
        `\uD83D\uDCB0 <b>Balans:</b> ${user.balance.toLocaleString()} so'm`,
      {
        parse_mode: "HTML",
        ...getDriverKeyboard(),
      },
    );

    if (!user.location?.latitude || !user.location?.longitude) {
      await ctx.reply(
        "\uD83D\uDCCD Eng yaqin buyurtmalarni olish uchun joriy lokatsiyangizni yuboring.",
      );
      return;
    }

    const sentCount = await sendNearestPendingOrdersToDriver(
      ctx.telegram,
      user,
    );
    if (sentCount > 0) {
      await ctx.reply(
        `\uD83D\uDCE8 Sizga yaqin bo'lgan ${sentCount} ta kutilayotgan buyurtma yuborildi.`,
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
      "\u2705 Ishni yakunladingiz.\n\n\uD83D\uDCCA Status: \uD83D\uDD34 Oflayn",
      Markup.keyboard([[BUTTONS.enableDriverMode], [BUTTONS.mainMenu]]).resize(),
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

    let expiryText = "\u274C Aktiv emas";
    if (user?.subscriptionUntil && user.subscriptionUntil > now) {
      expiryText = formatTimeLeft(user.subscriptionUntil - now);
    }

    await ctx.reply(
      `\uD83D\uDC64 <b>Shaxsiy hisob:</b>\n\n` +
        `\uD83C\uDD94 <b>ID:</b> <code>${ctx.from.id}</code>\n` +
        `\uD83D\uDCB0 <b>Balans:</b> ${balance.toLocaleString()} so'm\n` +
        `\uD83D\uDCC5 <b>Obuna tugashiga:</b> ${expiryText} qoldi\n` +
        `\uD83D\uDCCA <b>Status:</b> ${user?.isOnline ? "\uD83D\uDFE2 Onlayn" : "\uD83D\uDD34 Oflayn"}\n\n` +
        `<i>\uD83D\uDCA1 Eslatma: Obuna tugashi bilan balans nolga tushadi.</i>`,
      {
        parse_mode: "HTML",
        ...Markup.keyboard([
          [BUTTONS.topUp],
          [Markup.button.locationRequest(BUTTONS.refreshLocation)],
          [BUTTONS.mainMenu],
        ]).resize(),
      },
    );
  } catch (error) {
    console.error("ShowAccount Error:", error);
  }
}

export async function startSubscriptionChecker(bot) {
  setInterval(async () => {
    try {
      const now = new Date();
      const expiredUsers = await User.find({
        subscriptionUntil: { $lt: now, $ne: null },
      });

      for (const user of expiredUsers) {
        user.balance = 0;
        user.isOnline = false;
        user.subscriptionUntil = null;
        await user.save();

        try {
          await bot.telegram.sendMessage(
            user.telegramId,
            `\u26A0\uFE0F <b>Diqqat! Obuna muddati tugadi.</b>\n\n` +
              `Sizning haydovchilik hisobingiz vaqti tugadi va balansingiz nolga tushirildi.\n\n` +
              `Xizmatdan foydalanishni davom ettirish uchun hisobni qayta to'ldiring.`,
            {
              parse_mode: "HTML",
              ...Markup.keyboard([[BUTTONS.topUp], [BUTTONS.mainMenu]]).resize(),
            },
          );
        } catch (err) {
          console.error(
            `Obuna tugashi xabarini yuborishda xato (ID: ${user.telegramId}):`,
            err.message,
          );
        }
      }
    } catch (error) {
      console.error("Subscription checker loop error:", error);
    }
  }, 60 * 1000);
}
