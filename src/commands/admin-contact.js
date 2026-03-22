export default async function adminContact(bot) {
  bot.command("support", async (ctx) => {
    const adminContactMessage =
      "<b>👨‍💻 Admin bilan bog‘lanish</b>\n\n" +
      "Bot bo‘yicha savollar, takliflar yoki texnik nosozliklar yuzaga kelgan bo‘lsa, bizga murojaat qiling.\n\n" +
      "<i>Admin ish vaqti: 09:00 - 20:00</i>";

    await ctx.reply(adminContactMessage, {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "✉️ Adminga yozish", url: "https://t.me/akbaral1" }],
          [
            {
              text: "📢 Rasmiy kanalimiz",
              url: "https://t.me/sizning_kanalingiz",
            }, // Agar kanal bo'lsa
          ],
        ],
      },
    });
  });
}
