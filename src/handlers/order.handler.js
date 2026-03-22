import Order from "../models/Order.js";
import User from "../models/User.js";
import { Markup } from "telegraf";
import driverHandler from "./driver.handler.js";
import mainkeyboard from "../keyboards/main.keyboard.js";

export default function orderHandler(bot) {
  bot.on("text", async (ctx) => {
    const text = ctx.message.text;
    const telegramId = ctx.from.id;

    if (text === "🚖 Haydovchi bo‘lish") return driverHandler(ctx);
    if (text === "⬅️ Orqaga") {
      await User.findOneAndUpdate({ telegramId }, { step: "menu" });
      return ctx.reply("Asosiy menyuga qaytdingiz.", {
        reply_markup: mainkeyboard.mainKeyboard,
      });
    }

    const user = await User.findOne({ telegramId });

    if (user && user.step === "waiting_description") {
      if (text.startsWith("🚕") || text.startsWith("⬅️")) return;

      try {
        const order = await Order.create({
          user: user._id,
          userId: user.telegramId,
          address: user.address,
          latitude: user.location.latitude,
          longitude: user.location.longitude,
          phoneNumber: user.phoneNumber,
          firstName: user.firstName,
          note: text,
          status: "draft",
        });

        const previewMessage = `
📝 <b>Buyurtma ma'lumotlari:</b>

📍 <b>Manzil:</b> ${order.address}
📞 <b>Tel:</b> +${order.phoneNumber}
👤 <b>Ism:</b> ${order.firstName}
💬 <b>Izoh:</b> ${order.note}

<i>Ma'lumotlar to'g'rimi?</i>`;

        await ctx.reply(previewMessage, {
          parse_mode: "HTML",
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(
                "✅ Tasdiqlash",
                `confirm_order_${order._id}`,
              ),
            ],
            [
              Markup.button.callback(
                "❌ Bekor qilish",
                `cancel_order_${order._id}`,
              ),
            ],
          ]),
        });

        user.step = "confirming";
        await user.save();
      } catch (err) {
        console.error("Zakas previewda xato:", err);
        await ctx.reply("❌ Xatolik yuz berdi.");
      }
    }
  });
}
