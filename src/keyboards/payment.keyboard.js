import { Markup } from "telegraf";

export default function paymentKeyboard(ctx) {
  return ctx.reply(
    "<b>💳 TO'LOV TIZIMI</b>\n\n" +
      "Haydovchi rejimini faollashtirish uchun tariflardan birini tanlang. " +
      "To'lov tasdiqlangach, barcha buyurtmalar sizga ko'rina boshlaydi.\n\n" +
      "✨ <b>Mavjud tariflar:</b>",
    {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "💎 1 OY — 149 000 so'm (Tejamkor 🔥)",
            "tarif1",
          ),
        ],
        [Markup.button.callback("📅 1 HAFTA — 49 000 so'm", "tarif2")],
        [Markup.button.callback("☀️ 1 KUN — 9 000 so'm", "tarif3")],
        [
          Markup.button.url(
            "👨‍💻 Admin bilan bog'lanish",
            "https://t.me/akbaral1",
          ),
        ],
      ]),
    },
  );
}
