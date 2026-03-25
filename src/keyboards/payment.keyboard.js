import { Markup } from "telegraf";
import { SUBSCRIPTION_PLANS } from "../services/price.service.js";

export default function paymentKeyboard(ctx) {
  const [monthlyPlan, weeklyPlan, dailyPlan] = Object.values(SUBSCRIPTION_PLANS);

  return ctx.reply(
    "<b>\uD83D\uDCB3 TO'LOV TIZIMI</b>\n\n" +
      "Haydovchi rejimini faollashtirish uchun tariflardan birini tanlang. " +
      "To'lov tasdiqlangach, barcha buyurtmalar sizga ko'rina boshlaydi.\n\n" +
      "\u2728 <b>Mavjud tariflar:</b>",
    {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback(
            `\uD83D\uDC8E 1 OY - ${monthlyPlan.amount.toLocaleString()} so'm (Tejamkor \uD83D\uDD25)`,
            "tarif1",
          ),
        ],
        [
          Markup.button.callback(
            `\uD83D\uDCC5 1 HAFTA - ${weeklyPlan.amount.toLocaleString()} so'm`,
            "tarif2",
          ),
        ],
        [
          Markup.button.callback(
            `\u2600\uFE0F 1 KUN - ${dailyPlan.amount.toLocaleString()} so'm`,
            "tarif3",
          ),
        ],
      ]),
    },
  );
}
