export default async function taxiHandler(ctx) {
  await ctx.reply(
    "📍 Iltimos, joylashuvingizni yuboring\n\n_ESLATMS:  Joylashuvni yuborishdan oldin qurulmada Joylashuv funksiyasi yoqing._",
    {
      parse_mode: "Markdown",
      reply_markup: {
        keyboard: [
          [
            { text: "📍 Lokatsiyani yuborish", request_location: true },
            { text: "ℹ️ Mening elonlarim" },
          ],
          ["⬅️ Orqaga"],
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    },
  );
}
