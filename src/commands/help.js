// help.js fayli uchun tayyor matn
export default async function help(bot) {
  bot.command("help", async (ctx) => {
    const helpMessage =
      "🚖 *Taxi Bot - Foydalanish qo'llanmasi*\n\n" +
      "Bot orqali tezda taksi buyurtma qilishingiz yoki haydovchi sifatida mijoz topishingiz mumkin.\n\n" +
      "*1. Yo'lovchilar uchun:*\n" +
      "• /start - Botni ishga tushiring.\n" +
      "• *Buyurtma berish:* 🚕 Taxi chaqirish tugmasini bosing va botga tugan joyingiz lokatsiasini jonating song haydovchi uchun qisqacha izoh qoldiring.\n" +
      "*2. Haydovchilar uchun:*\n" +
      "• *Haydovchi bo'lish: 🚖 Haydovchi bo‘lish tugmasini bosing va haydovchilik faoliyatingizni boshlang.* \n" +
      "*3. Foydali buyruqlar:*\n" +
      "• /profile - Ma'lumotlaringizni tahrirlash.\n" +
      "• /settings - Tilni yoki bildirishnomalarni sozlash.\n" +
      "• /support - Muammo yuzaga kelsa, adminga murojaat qilish.\n\n" +
      "💡 *Maslahat:* Buyurtma berishda manzilni aniq ko'rsatish haydovchi sizni tezroq topishiga yordam beradi.";

    await ctx.reply(helpMessage, { parse_mode: "Markdown" });
  });
}
