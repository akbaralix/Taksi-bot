import dotenv from "dotenv";
dotenv.config();

import { Telegraf } from "telegraf";
import connectDB from "./database/connect.js";
import User from "./models/User.js";
import startHandler from "./handlers/start.handler.js";
import adminHandler from "./handlers/admin.handler.js";
import driverHandler, {
  stopDriverWork,
  showMyAccount,
} from "./handlers/driver.handler.js";
import { getMainKeyboard } from "./keyboards/main.keyboard.js";
import locationHandler, {
  saveUserLocation,
} from "./services/location.service.js";
import myOrders, {
  sendNearestPendingOrdersToDriver,
} from "./handlers/client.handler.js";
import orderHandler from "./handlers/order.handler.js";
import paymentHandler from "./handlers/payment.handler.js";
import help from "./commands/help.js";
import adminContact from "./commands/admin-contact.js";
import paymentKeyboard from "./keyboards/payment.keyboard.js";
import { markUserActive } from "./services/telegram.service.js";
import { BOT_TOKEN } from "./config/index.js";
import { BUTTONS } from "./config/text.js";

if (!BOT_TOKEN) {
  throw new Error("BOT_TOKEN .env faylida topilmadi!");
}

const bot = new Telegraf(BOT_TOKEN);

function registerCoreHandlers() {
  help(bot);
  adminContact(bot);
  adminHandler(bot);
  myOrders(bot);
  orderHandler(bot);
  paymentHandler(bot);
}

function registerMenuHandlers() {
  bot.hears(BUTTONS.mainMenu, async (ctx) => {
    await User.findOneAndUpdate({ telegramId: ctx.from.id }, { step: "menu" });
    return ctx.reply("Asosiy menyuga qaytdingiz.", {
      reply_markup: getMainKeyboard(ctx.from.id),
    });
  });

  bot.hears(BUTTONS.account, showMyAccount);
  bot.hears(BUTTONS.topUp, paymentKeyboard);
  bot.hears(BUTTONS.stopWork, stopDriverWork);
  bot.hears(BUTTONS.enableDriverMode, driverHandler);
}

function registerStartHandler() {
  bot.start(async (ctx) => {
    const telegramId = ctx.from.id;
    await User.findOneAndUpdate(
      { telegramId },
      { telegramId, step: "start" },
      { upsert: true },
    );

    await startHandler(ctx);
  });
}

function registerContactHandler() {
  bot.on("contact", async (ctx) => {
    const contact = ctx.message.contact;
    const telegramId = ctx.from.id;

    if (contact.user_id !== telegramId) {
      return ctx.reply(
        "\u274C Iltimos, faqat o'z telefon raqamingizni yuboring.\n\n\uD83D\uDCF1 Pastdagi tugma orqali yuboring.",
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
        `\u2705 <b>Rahmat, ${contact.first_name}!</b> Ro'yxatdan o'tdingiz.\n\nEndi quyidagi menyudan sizga kerakli bo'limni tanlang.`,
        {
          reply_markup: getMainKeyboard(ctx.from.id),
          parse_mode: "HTML",
        },
      );
    } catch (err) {
      console.error("Contact saqlashda xato:", err);
      await ctx.reply(
        "\u274C Telefon raqamni saqlashda xatolik yuz berdi.",
      );
    }
  });
}

function registerLocationHandler() {
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
          `\uD83D\uDCCD Lokatsiyangiz yangilandi.\n\nYangi manzil: ${result.address}`,
        );

        const sentCount = await sendNearestPendingOrdersToDriver(
          ctx.telegram,
          result.user,
        );
        if (sentCount > 0) {
          await ctx.reply(
            `\uD83D\uDCE8 Sizga yaqin bo'lgan ${sentCount} ta kutilayotgan buyurtma yuborildi.`,
          );
        }
      } catch (error) {
        console.error("Driver location update error:", error);
        await ctx.reply("\u274C Lokatsiyani yangilab bo'lmadi.");
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
}

bot.use(async (ctx, next) => {
  if (ctx.from) {
    await markUserActive(ctx.from);
  }

  return next();
});

registerCoreHandlers();
registerMenuHandlers();
registerStartHandler();
registerContactHandler();
registerLocationHandler();

async function bootstrap() {
  await connectDB();
  await bot.launch();
  console.log("Bot 100% tayyor!");
}

bootstrap().catch((error) => {
  console.error("Bot ishga tushmadi:", error);
  process.exit(1);
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
