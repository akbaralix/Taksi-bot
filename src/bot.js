import dotenv from "dotenv";
dotenv.config();

import http from "http";
import { Telegraf, Markup } from "telegraf";
import connectDB from "./database/connect.js";
import User from "./models/User.js";
import Order from "./models/Order.js";
import startHandler from "./handlers/start.handler.js";
import adminHandler from "./handlers/admin.handler.js";
import driverHandler, {
  stopDriverWork,
  showMyAccount,
  startSubscriptionChecker,
} from "./handlers/driver.handler.js";
import { getMainKeyboard } from "./keyboards/main.keyboard.js";
import locationHandler, {
  saveUserLocation,
} from "./services/location.service.js";
import myOrders, {
  sendNearestPendingOrdersToDriver,
} from "./handlers/client.handler.js";
import help from "./commands/help.js";
import adminContact from "./commands/admin-contact.js";
import paymentKeyboard from "./keyboards/payment.keyboard.js";
import {
  markUserActive,
  safeSendMessage,
} from "./services/telegram.service.js";

const ADMIN_ID = process.env.ADMIN_ID;
const KARTA_RAQAM = "9860 0000 0000 0000";

if (!process.env.BOT_TOKEN) {
  throw new Error("BOT_TOKEN .env faylida topilmadi!");
}

const bot = new Telegraf(process.env.BOT_TOKEN);

function formatTripTime(totalSeconds) {
  const safeSeconds = Math.max(0, Number(totalSeconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

async function completeRideAndNotify(telegram, driverTelegramId, data) {
  const order = await Order.findOne({
    _id: data.orderId,
    status: "accepted",
  });

  if (!order) {
    return { ok: false, message: "Buyurtma topilmadi yoki allaqachon yakunlangan." };
  }

  const driver = await User.findOne({ telegramId: Number(driverTelegramId) });
  if (!driver || String(order.driverId) !== String(driver._id)) {
    return { ok: false, message: "Bu buyurtmani yakunlashga ruxsat yo'q." };
  }

  const distanceKm = Math.max(0, Number(data.distanceKm) || 0);
  const durationSec = Math.max(0, Number(data.durationSec) || 0);
  const price = Math.max(0, Number(data.price) || 0);

  order.status = "completed";
  order.tripDistanceKm = distanceKm;
  order.tripDurationSec = durationSec;
  order.tripPrice = price;
  order.completedAt = new Date();
  await order.save();

  await safeSendMessage(
    telegram,
    order.userId,
    `🚕 <b>Safar yakunlandi</b>\n\n` +
      `📏 Masofa: <b>${distanceKm.toFixed(2)} km</b>\n` +
      `⏱ Vaqt: <b>${formatTripTime(durationSec)}</b>\n` +
      `💵 Narx: <b>${price.toLocaleString()} so'm</b>`,
    { parse_mode: "HTML" },
  );

  return {
    ok: true,
    distanceKm,
    durationSec,
    price,
  };
}

bot.use(async (ctx, next) => {
  if (ctx.from) {
    await markUserActive(ctx.from);
  }

  return next();
});

help(bot);
adminContact(bot);
adminHandler(bot);
myOrders(bot);

bot.hears("⬅️ Asosiy menyu", async (ctx) => {
  await User.findOneAndUpdate({ telegramId: ctx.from.id }, { step: "menu" });
  return ctx.reply("Asosiy menyuga qaytdingiz.", {
    reply_markup: getMainKeyboard(ctx.from.id),
  });
});
bot.hears("👤 Hisobim", showMyAccount);
bot.hears("💳 Hisobni to'ldirish", paymentKeyboard);
bot.hears("📴 Ishni yakunlash", stopDriverWork);
bot.hears("🚕 Haydovchi rejimini yoqish", driverHandler);

bot.start(async (ctx) => {
  const telegramId = ctx.from.id;
  await User.findOneAndUpdate(
    { telegramId },
    { telegramId, step: "start" },
    { upsert: true },
  );

  await startHandler(ctx);
});

bot.on("contact", async (ctx) => {
  const contact = ctx.message.contact;
  const telegramId = ctx.from.id;

  if (contact.user_id !== telegramId) {
    return ctx.reply(
      "❌ Iltimos, faqat o'z telefon raqamingizni yuboring.\n\n📱 Pastdagi tugma orqali yuboring.",
    );
  }

  try {
    const userData = {
      telegramId,
      phoneNumber: contact.phone_number,
      firstName: ctx.from.first_name,
      username: ctx.from.username,
      step: "menu",
    };

    await User.findOneAndUpdate({ telegramId }, userData, { upsert: true });

    await ctx.reply(
      `✅ <b>Rahmat, ${contact.first_name}!</b> Ro'yxatdan o'tdingiz.\n\nEndi quyidagi menyudan sizga kerakli bo'limni tanlang.`,
      {
        reply_markup: getMainKeyboard(ctx.from.id),
        parse_mode: "HTML",
      },
    );
  } catch (err) {
    console.error("Contact saqlashda xato:", err);
    await ctx.reply("❌ Telefon raqamni saqlashda xatolik yuz berdi.");
  }
});

bot.on("location", async (ctx) => {
  await bot.telegram.sendChatAction(ctx.chat.id, "typing");

  const user = await User.findOne({ telegramId: ctx.from.id });
  const isOnlineDriver = user?.role === "driver" && user?.isOnline;

  if (isOnlineDriver) {
    try {
      const result = await saveUserLocation(ctx);
      if (!result.ok) {
        return;
      }

      await ctx.reply(
        `📍 Lokatsiyangiz yangilandi.\n\nYangi manzil: ${result.address}`,
      );

      const sentCount = await sendNearestPendingOrdersToDriver(
        ctx.telegram,
        result.user,
      );
      if (sentCount > 0) {
        await ctx.reply(
          `📨 Sizga yaqin bo'lgan ${sentCount} ta kutilayotgan buyurtma yuborildi.`,
        );
      }
    } catch (error) {
      console.error("Driver location update error:", error);
      await ctx.reply("❌ Lokatsiyani yangilab bo'lmadi.");
    }
    return;
  }

  const result = await locationHandler(ctx);
  if (result?.ok) {
    await User.findOneAndUpdate(
      { telegramId: ctx.from.id },
      { step: "waiting_description" },
    );
  }
});

bot.on("text", async (ctx) => {
  const text = ctx.message.text;
  const telegramId = ctx.from.id;

  if (text === "🚖 Haydovchi bo‘lish" || text === "🚖 Haydovchi bo'lish") {
    return driverHandler(ctx);
  }

  if (text === "⬅️ Orqaga") {
    await User.findOneAndUpdate({ telegramId }, { step: "menu" });
    return ctx.reply("Asosiy menyuga qaytdingiz.", {
      reply_markup: getMainKeyboard(ctx.from.id),
    });
  }

  const user = await User.findOne({ telegramId });

  if (user?.step === "waiting_description") {
    if (text.startsWith("🚕") || text.startsWith("⬅️")) {
      return;
    }

    if (
      !user.location?.latitude ||
      !user.location?.longitude ||
      !user.address
    ) {
      await User.findOneAndUpdate({ telegramId }, { step: "menu" });
      return ctx.reply(
        "❌ Lokatsiya topilmadi. Iltimos, qaytadan joylashuvingizni yuboring.",
        {
          reply_markup: getMainKeyboard(ctx.from.id),
        },
      );
    }

    try {
      const order = await Order.create({
        user: user._id,
        userId: String(user.telegramId),
        firstName: user.firstName,
        address: user.address,
        latitude: user.location.latitude,
        longitude: user.location.longitude,
        phoneNumber: user.phoneNumber,
        note: text,
        status: "draft",
      });

      const previewMessage =
        `📝 <b>Buyurtma ma'lumotlari:</b>\n\n` +
        `📍 <b>Manzil:</b> ${order.address}\n` +
        `📞 <b>Tel:</b> +${order.phoneNumber}\n` +
        `👤 <b>Ism:</b> ${order.firstName}\n` +
        `💬 <b>Izoh:</b> ${order.note}\n\n` +
        `<i>Ma'lumotlar to'g'rimi?</i>`;

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

const plans = {
  tarif1: { title: "1 oylik obuna", amount: 149000, days: 30 },
  tarif2: { title: "1 haftalik obuna", amount: 49000, days: 7 },
  tarif3: { title: "1 kunlik obuna", amount: 9000, days: 1 },
};

Object.keys(plans).forEach((key) => {
  bot.action(key, async (ctx) => {
    const plan = plans[key];
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
      `💳 <b>To'lov ma'lumotlari:</b>\n\n` +
        `Tarif: <b>${plan.title}</b>\n` +
        `Summa: <b>${plan.amount.toLocaleString()} so'm</b>\n\n` +
        `Karta: <code>${KARTA_RAQAM}</code>\n\n` +
        `To'lovni amalga oshirganingizdan so'ng, <b>chekni</b> rasm ko'rinishida yuboring.`,
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
    return ctx.reply("❌ ADMIN_ID sozlanmagan.");
  }

  const amount = user.step.split("_")[2];
  const photoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;

  await ctx.reply("⏳ Chek adminga yuborildi. Tasdiqlanishini kuting.");

  await ctx.telegram.sendPhoto(ADMIN_ID, photoId, {
    caption:
      `🔔 <b>Yangi to'lov so'rovi!</b>\n\n` +
      `👤 Foydalanuvchi: ${ctx.from.first_name}\n` +
      `🆔 ID: ${telegramId}\n` +
      `💰 Summa: ${parseInt(amount, 10).toLocaleString()} so'm\n` +
      `📝 Tarif: ${user.tempData || "Noma'lum"}\n\n` +
      `Tasdiqlaysizmi?`,
    parse_mode: "HTML",
    ...Markup.inlineKeyboard([
      [
        Markup.button.callback(
          "✅ Tasdiqlash",
          `approve_${telegramId}_${amount}`,
        ),
        Markup.button.callback("❌ Rad etish", `reject_${telegramId}`),
      ],
    ]),
  });

  user.step = "menu";
  user.tempData = undefined;
  await user.save();
});

bot.on("message", async (ctx, next) => {
  const payload = ctx.message?.web_app_data?.data;

  if (!payload) {
    return next();
  }

  try {
    const data = JSON.parse(payload);

    if (data?.type !== "ride_completed") {
      return ctx.reply("Web ilovadan noma'lum ma'lumot keldi.");
    }

    const result = await completeRideAndNotify(ctx.telegram, ctx.from.id, data);
    if (!result.ok) {
      return ctx.reply(result.message);
    }

    await ctx.reply(
      `✅ Buyurtma yakunlandi.\n\n📏 ${result.distanceKm.toFixed(2)} km\n⏱ ${formatTripTime(result.durationSec)}\n💵 ${result.price.toLocaleString()} so'm`,
    );
  } catch (error) {
    console.error("Web app data processing error:", error);
    await ctx.reply("Web ilova ma'lumotini qayta ishlashda xatolik yuz berdi.");
  }
});

bot.action(/approve_(\d+)_(\d+)/, async (ctx) => {
  const userId = ctx.match[1];
  const amount = parseInt(ctx.match[2], 10);
  const plan = Object.values(plans).find((item) => item.amount === amount);

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
      `✅ <b>To'lov tasdiqlandi!</b>\n\n` +
        `🆔 ID: ${userId}\n` +
        `💰 Qo'shildi: ${amount.toLocaleString()} so'm\n` +
        `💳 Jami balans: ${updatedUser.balance.toLocaleString()} so'm\n` +
        `📅 Yangi muddat: ${currentExpiry.toLocaleString()}`,
      { parse_mode: "HTML" },
    );

    await safeSendMessage(
      ctx.telegram,
      userId,
      `✅ <b>Hisobingiz to'ldirildi!</b>\n\n` +
        `💰 Qo'shilgan summa: <b>${amount.toLocaleString()} so'm</b>\n` +
        `💳 Umumiy balans: <b>${updatedUser.balance.toLocaleString()} so'm</b>\n` +
        `⏳ Amal qilish muddati: <b>${currentExpiry.toLocaleString()}</b> gacha uzaytirildi.`,
      { parse_mode: "HTML" },
    );

    await ctx.answerCbQuery("To'lov tasdiqlandi.");
  } catch (err) {
    console.error("Admin tasdiqlashda xato:", err);
    await ctx.reply("❌ Xatolik yuz berdi.");
  }
});

bot.action(/reject_(\d+)/, async (ctx) => {
  const userId = ctx.match[1];
  await ctx.editMessageCaption("❌ To'lov rad etildi.");
  await safeSendMessage(
    ctx.telegram,
    userId,
    "❌ Kechirasiz, to'lovingiz admin tomonidan rad etildi. Chek xato yoki pul tushmagan bo'lishi mumkin.",
  );
  await ctx.answerCbQuery("To'lov rad etildi.");
});

async function bootstrap() {
  await connectDB();
  startSubscriptionChecker(bot);

  // Render health check uchun oddiy server
  const port = process.env.PORT || 3000;
  http
    .createServer(async (req, res) => {
      if (req.method === "POST" && req.url === "/api/webapp/ride-complete") {
        try {
          let body = "";

          req.on("data", (chunk) => {
            body += chunk;
          });

          req.on("end", async () => {
            try {
              const data = JSON.parse(body || "{}");
              const driverTelegramId = Number(data.driverTelegramId);
              const result = await completeRideAndNotify(
                bot.telegram,
                driverTelegramId,
                data,
              );

              res.writeHead(result.ok ? 200 : 400, {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type",
              });
              res.end(JSON.stringify(result));
            } catch (error) {
              console.error("Ride complete endpoint parse error:", error);
              res.writeHead(500, {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type",
              });
              res.end(JSON.stringify({ ok: false, message: "Server xatoligi" }));
            }
          });
          return;
        } catch (error) {
          console.error("Ride complete endpoint error:", error);
          res.writeHead(500, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type",
          });
          res.end(JSON.stringify({ ok: false, message: "Server xatoligi" }));
          return;
        }
      }

      if (req.method === "OPTIONS" && req.url === "/api/webapp/ride-complete") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        });
        res.end();
        return;
      }

      res.writeHead(200);
      res.end("Bot ishlayapti");
    })
    .listen(port, () => console.log(`Server portda eshitmoqda: ${port}`));

  await bot.launch();
  console.log("Bot 100% tayyor!");
}

bootstrap().catch((error) => {
  console.error("Bot ishga tushmadi:", error);
  process.exit(1);
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
