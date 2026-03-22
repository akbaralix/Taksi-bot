import User from "../models/User.js";
import mainkeyboard, { getMainKeyboard } from "../keyboards/main.keyboard.js";

export default async function startHandler(ctx) {
  const telegramId = ctx.from.id;

  try {
    const user = await User.findOne({ telegramId });

    if (!user || !user.phoneNumber) {
      await ctx.reply(
        "Salom! Botdan foydalanish uchun iltimos, telefon raqamingizni ulashing 👇",
        {
          reply_markup: mainkeyboard.phoneKeyboard,
        },
      );
    } else {
      await ctx.reply(
        `Salom, ${ctx.from.first_name}! Menyudan kerakli bo'limni tanlang 👇`,
        { reply_markup: getMainKeyboard(ctx.from.id) },
      );
    }
  } catch (err) {
    console.error("startHandler xato:", err);
    await ctx.reply("❌ Xatolik yuz berdi, qayta urinib ko'ring");
  }
}
