import { BUTTONS } from "../config/text.js";

export default async function taxiHandler(ctx) {
  await ctx.reply(
    "рџ“Ќ Iltimos, joylashuvingizni yuboring\n\n_ESLATMS:  Joylashuvni yuborishdan oldin qurulmada Joylashuv funksiyasi yoqing._",
    {
      parse_mode: "Markdown",
      reply_markup: {
        keyboard: [
          [
            { text: BUTTONS.sendLocation, request_location: true },
            { text: BUTTONS.myOrders },
          ],
          [BUTTONS.back],
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    },
  );
}
