import { Markup } from "telegraf";
import User from "../models/User.js";
import { ADMIN_ID, KARTA_RAQAM } from "../config/index.js";
import {
  SUBSCRIPTION_PLANS,
  findPlanByAmount,
} from "../services/price.service.js";
import { safeSendMessage } from "../services/telegram.service.js";

export default function paymentHandler(bot) {
  Object.keys(SUBSCRIPTION_PLANS).forEach((key) => {
    bot.action(key, async (ctx) => {
      const plan = SUBSCRIPTION_PLANS[key];
      const telegramId = ctx.from.id;

      await User.findOneAndUpdate(
        { telegramId },
        {
          step: `waiting_screenshot_${plan.amount}`,
          tempData: plan.title,
        },
      );

      await ctx.answerCbQuery();
      await ctx.reply(
        `рџ’і <b>To'lov ma'lumotlari:</b>\n\n` +
          `<b>Tarif</b>: ${plan.title}\n` +
          `<b>Summa</b>: <code>${plan.amount.toLocaleString()} so'm</code>\n\n` +
          `<b>Karta</b>: <code>${KARTA_RAQAM}</code>\n\n` +
          `To'lovni amalga oshirganingizdan so'ng, <b>chekni</b> rasm ko'rinishida <b>shu yerga</b> yuboring.`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "Admin bilan bog'lanish", url: "https://t.me/akbaral1" }],
            ],
          },
        },
      );
    });
  });

  bot.on("photo", async (ctx) => {
    const telegramId = ctx.from.id;
    const user = await User.findOne({ telegramId });

    if (!user?.step?.startsWith("waiting_screenshot_")) {
      return;
    }

    if (!ADMIN_ID) {
      return ctx.reply("вќЊ ADMIN_ID sozlanmagan.");
    }

    const amount = user.step.split("_")[2];
    const photoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;

    await ctx.reply("вЏі Chek adminga yuborildi. Tasdiqlanishini kuting.");

    await ctx.telegram.sendPhoto(ADMIN_ID, photoId, {
      caption:
        `рџ”” <b>Yangi to'lov so'rovi!</b>\n\n` +
        `рџ‘¤ Foydalanuvchi: ${ctx.from.first_name}\n` +
        `рџ†” ID: ${telegramId}\n` +
        `рџ’° Summa: ${parseInt(amount, 10).toLocaleString()} so'm\n` +
        `рџ“ќ Tarif: ${user.tempData || "Noma'lum"}\n\n` +
        `Tasdiqlaysizmi?`,
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "вњ… Tasdiqlash",
            `approve_${telegramId}_${amount}`,
          ),
          Markup.button.callback("вќЊ Rad etish", `reject_${telegramId}`),
        ],
      ]),
    });

    user.step = "menu";
    user.tempData = undefined;
    await user.save();
  });

  bot.action(/approve_(\d+)_(\d+)/, async (ctx) => {
    const userId = ctx.match[1];
    const amount = parseInt(ctx.match[2], 10);
    const plan = findPlanByAmount(amount);

    try {
      if (!plan) {
        return ctx.answerCbQuery("Noma'lum tarif.", { show_alert: true });
      }

      const user = await User.findOne({ telegramId: userId });
      if (!user) {
        return ctx.answerCbQuery("Foydalanuvchi topilmadi.", {
          show_alert: true,
        });
      }

      const currentExpiry =
        user.subscriptionUntil && user.subscriptionUntil > new Date()
          ? new Date(user.subscriptionUntil)
          : new Date();

      currentExpiry.setDate(currentExpiry.getDate() + plan.days);

      const updatedUser = await User.findOneAndUpdate(
        { telegramId: userId },
        {
          $inc: { balance: amount },
          $set: {
            subscriptionUntil: currentExpiry,
            role: "driver",
          },
        },
        { new: true },
      );

      await ctx.editMessageCaption(
        `вњ… <b>To'lov tasdiqlandi!</b>\n\n` +
          `рџ†” ID: ${userId}\n` +
          `рџ’° Qo'shildi: ${amount.toLocaleString()} so'm\n` +
          `рџ’і Jami balans: ${updatedUser.balance.toLocaleString()} so'm\n` +
          `рџ“… Yangi muddat: ${currentExpiry.toLocaleString()}`,
        { parse_mode: "HTML" },
      );

      await safeSendMessage(
        ctx.telegram,
        userId,
        `вњ… <b>Hisobingiz to'ldirildi!</b>\n\n` +
          `рџ’° Qo'shilgan summa: <b>${amount.toLocaleString()} so'm</b>\n` +
          `рџ’і Umumiy balans: <b>${updatedUser.balance.toLocaleString()} so'm</b>\n` +
          `вЏі Amal qilish muddati: <b>${currentExpiry.toLocaleString()}</b> gacha uzaytirildi.`,
        { parse_mode: "HTML" },
      );

      await ctx.answerCbQuery("To'lov tasdiqlandi.");
    } catch (err) {
      console.error("Admin tasdiqlashda xato:", err);
      await ctx.reply("вќЊ Xatolik yuz berdi.");
    }
  });

  bot.action(/reject_(\d+)/, async (ctx) => {
    const userId = ctx.match[1];
    await ctx.editMessageCaption("вќЊ To'lov rad etildi.");
    await safeSendMessage(
      ctx.telegram,
      userId,
      "вќЊ Kechirasiz, to'lovingiz admin tomonidan rad etildi. Chek xato yoki pul tushmagan bo'lishi mumkin.",
    );
    await ctx.answerCbQuery("To'lov rad etildi.");
  });
}
