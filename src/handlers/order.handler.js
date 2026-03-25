import User from "../models/User.js";
import { Markup } from "telegraf";
import driverHandler from "./driver.handler.js";
import { getMainKeyboard } from "../keyboards/main.keyboard.js";
import {
  buildOrderPreviewMessage,
  createDraftOrder,
} from "../services/order.service.js";
import { BUTTONS } from "../config/text.js";

export default function orderHandler(bot) {
  bot.on("text", async (ctx) => {
    const text = ctx.message.text;
    const telegramId = ctx.from.id;

    if (text === BUTTONS.becomeDriver) {
      return driverHandler(ctx);
    }

    if (text === BUTTONS.back) {
      await User.findOneAndUpdate({ telegramId }, { step: "menu" });
      return ctx.reply("Asosiy menyuga qaytdingiz.", {
        reply_markup: getMainKeyboard(ctx.from.id),
      });
    }

    const user = await User.findOne({ telegramId });

    if (user?.step !== "waiting_description") {
      return;
    }

    if (text.startsWith("\uD83D\uDE95") || text.startsWith("\u2B05\uFE0F")) {
      return;
    }

    if (
      !user.location?.latitude ||
      !user.location?.longitude ||
      !user.address
    ) {
      await User.findOneAndUpdate({ telegramId }, { step: "menu" });
      return ctx.reply(
        "\u274C Lokatsiya topilmadi. Iltimos, qaytadan joylashuvingizni yuboring.",
        {
          reply_markup: getMainKeyboard(ctx.from.id),
        },
      );
    }

    try {
      const order = await createDraftOrder(user, text);

      await ctx.reply(buildOrderPreviewMessage(order), {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("\u2705 Tasdiqlash", `confirm_order_${order._id}`)],
          [Markup.button.callback("\u274C Bekor qilish", `cancel_order_${order._id}`)],
        ]),
      });

      user.step = "confirming";
      await user.save();
    } catch (err) {
      console.error("Zakas previewda xato:", err);
      await ctx.reply("\u274C Xatolik yuz berdi.");
    }
  });
}
