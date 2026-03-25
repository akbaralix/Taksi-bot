import Order from "../models/Order.js";
import User from "../models/User.js";
import taxiHandler from "../keyboards/client.keyboard.js";
import { Markup } from "telegraf";
import { safeSendMessage } from "../services/telegram.service.js";
import { BUTTONS } from "../config/text.js";
import { DRIVER_WEBAPP_URL, WEBAPP_API_URL } from "../config/index.js";

const MAX_NEAREST_DRIVERS = 5;
const MAX_PENDING_ORDERS_FOR_DRIVER = 5;
const DRIVER_ORDER_RADIUS_KM = 5;

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function calculateDistanceKm(from, to) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(dLon / 2) ** 2;

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function hasCoordinates(entity) {
  return Boolean(entity?.latitude && entity?.longitude);
}

function buildDriverWebAppUrl(orderId, driverTelegramId, driverName, driverPhotoUrl) {
  const url = new URL(DRIVER_WEBAPP_URL);
  url.searchParams.set("orderId", String(orderId));
  url.searchParams.set("driverTelegramId", String(driverTelegramId));
  if (driverName) {
    url.searchParams.set("driverName", driverName);
  }
  if (driverPhotoUrl) {
    url.searchParams.set("driverPhotoUrl", driverPhotoUrl);
  }
  if (WEBAPP_API_URL) {
    url.searchParams.set("apiBase", WEBAPP_API_URL);
  }
  return url.toString();
}

async function getTelegramProfilePhotoUrl(telegram, telegramId) {
  try {
    const photos = await telegram.getUserProfilePhotos(telegramId, 0, 1);
    const fileId = photos?.photos?.[0]?.[0]?.file_id;

    if (!fileId) {
      return "";
    }

    const fileLink = await telegram.getFileLink(fileId);
    return fileLink?.toString() || "";
  } catch (error) {
    console.error("Driver profile photo olishda xato:", error.message);
    return "";
  }
}

async function findNearestActiveDrivers(order) {
  const now = new Date();
  const drivers = await User.find({
    role: "driver",
    isOnline: true,
    subscriptionUntil: { $gt: now },
    "location.latitude": { $ne: null },
    "location.longitude": { $ne: null },
  });

  return drivers
    .map((driver) => ({
      driver,
      distanceKm: calculateDistanceKm(
        {
          latitude: order.latitude,
          longitude: order.longitude,
        },
        {
          latitude: driver.location.latitude,
          longitude: driver.location.longitude,
        },
      ),
    }))
    .filter(({ distanceKm }) => distanceKm <= DRIVER_ORDER_RADIUS_KM)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, MAX_NEAREST_DRIVERS);
}

function buildDriverOrderMessage(order, distanceKm) {
  const googleMapsUrl = `https://www.google.com/maps?q=${order.latitude},${order.longitude}`;

  return (
    `\uD83C\uDD95 <b>Yangi buyurtma!</b>\n\n` +
    `\uD83D\uDCCD Manzil: ${order.address}\n` +
    `\uD83D\uDCCF Sizgacha masofa: ${distanceKm.toFixed(1)} km\n` +
    `\uD83D\uDCDD Izoh: ${order.note || "Yo'q"}\n` +
    `\uD83D\uDCF1 Tel: +${order.phoneNumber}\n` +
    `\uD83D\uDC64 Ism: ${order.firstName}\n\n` +
    `<a href="${googleMapsUrl}">\uD83D\uDCCD Xaritada ko'rish</a>`
  );
}

async function notifyDriverAboutOrder(telegram, driver, order, distanceKm) {
  const sentMessage = await safeSendMessage(
    telegram,
    driver.telegramId,
    buildDriverOrderMessage(order, distanceKm),
    {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("\uD83D\uDE95 Qabul qilish", `accept_order_${order._id}`)],
      ]),
    },
  );

  if (!sentMessage) {
    return null;
  }

  await Order.updateOne(
    { _id: order._id },
    { $addToSet: { notifiedDrivers: driver.telegramId } },
  );

  return sentMessage;
}

export async function sendNearestPendingOrdersToDriver(telegram, driver) {
  if (!driver?.isOnline || !driver?.location || !driver?.subscriptionUntil) {
    return 0;
  }

  if (driver.subscriptionUntil <= new Date()) {
    return 0;
  }

  if (!hasCoordinates(driver.location)) {
    return 0;
  }

  const pendingOrders = await Order.find({
    status: "pending",
    notifiedDrivers: { $ne: driver.telegramId },
    latitude: { $ne: null },
    longitude: { $ne: null },
  });

  const nearestOrders = pendingOrders
    .map((order) => ({
      order,
      distanceKm: calculateDistanceKm(
        {
          latitude: driver.location.latitude,
          longitude: driver.location.longitude,
        },
        {
          latitude: order.latitude,
          longitude: order.longitude,
        },
      ),
    }))
    .filter(({ distanceKm }) => distanceKm <= DRIVER_ORDER_RADIUS_KM)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, MAX_PENDING_ORDERS_FOR_DRIVER);

  for (const { order, distanceKm } of nearestOrders) {
    await notifyDriverAboutOrder(telegram, driver, order, distanceKm).catch(() => {
      console.log(`Xabar ketmadi ID: ${driver.telegramId}`);
    });
  }

  return nearestOrders.length;
}

async function dispatchOrderToNearestDrivers(telegram, order) {
  const nearestDrivers = await findNearestActiveDrivers(order);

  for (const { driver, distanceKm } of nearestDrivers) {
    await notifyDriverAboutOrder(telegram, driver, order, distanceKm).catch(() => {
      console.log(`Xabar ketmadi ID: ${driver.telegramId}`);
    });
  }

  return nearestDrivers.length;
}

export default function myOrders(bot) {
  bot.hears(BUTTONS.callTaxi, async (ctx) => {
    try {
      await User.findOneAndUpdate({ telegramId: ctx.from.id }, { role: "client" });
      await taxiHandler(ctx);
    } catch (err) {
      console.error("Taxi chaqirishda xato:", err);
    }
  });

  bot.hears(BUTTONS.myOrders, async (ctx) => {
    try {
      const orders = await Order.find({ userId: String(ctx.from.id) }).sort({
        createdAt: -1,
      });

      if (!orders.length) {
        return ctx.reply("Sizda hozircha hech qanday buyurtma yo'q \u274C");
      }

      for (const order of orders) {
        const message =
          `\uD83C\uDD94 <b>Buyurtma:</b> #${order._id.toString().slice(-5)}\n` +
          `\uD83D\uDCCD <b>Manzil:</b> ${order.address}\n` +
          `\uD83D\uDCF1 <b>Telefon:</b> +${order.phoneNumber}\n` +
          `\uD83D\uDC64 <b>Ism:</b> ${order.firstName}\n` +
          `\uD83D\uDCCA <b>Status:</b> ${order.status}\n` +
          `\uD83D\uDCDD <b>Izoh:</b> ${order.note || "Yo'q"}`;

        await ctx.reply(message, {
          parse_mode: "HTML",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("\u274C Bekor qilish", `cancel_order_${order._id}`)],
          ]),
        });
      }
    } catch (err) {
      console.error("Elonlarni olishda xato:", err);
      await ctx.reply("\u26A0\uFE0F Ma'lumotlarni yuklashda xatolik yuz berdi.");
    }
  });

  bot.action(/confirm_order_(.+)/, async (ctx) => {
    const orderId = ctx.match[1];

    try {
      const order = await Order.findOneAndUpdate(
        { _id: orderId, status: "draft" },
        { status: "pending" },
        { new: true },
      );

      if (!order) {
        return ctx.answerCbQuery("Bu buyurtma allaqachon yuborilgan yoki topilmadi!");
      }

      await User.findOneAndUpdate(
        { telegramId: ctx.from.id },
        { step: "menu" },
      );

      await dispatchOrderToNearestDrivers(ctx.telegram, order);

      await ctx.editMessageText(
        "\u2705 Buyurtma qabul qilindi, tez orada siz bilan bog'laniladi.",
      );
      await ctx.answerCbQuery("Buyurtma qabul qilindi.");
    } catch (error) {
      console.error("Confirm error:", error);
      await ctx.answerCbQuery("Xatolik yuz berdi.");
    }
  });

  bot.action(/accept_order_(.+)/, async (ctx) => {
    const orderId = ctx.match[1];
    const driverTelegramId = ctx.from.id;

    try {
      const driver = await User.findOne({
        telegramId: driverTelegramId,
        role: "driver",
        isOnline: true,
        subscriptionUntil: { $gt: new Date() },
      });

      if (!driver) {
        return ctx.answerCbQuery("Haydovchi rejimi faol emas.", {
          show_alert: true,
        });
      }

      const driverPhotoUrl = await getTelegramProfilePhotoUrl(
        ctx.telegram,
        driverTelegramId,
      );

      const order = await Order.findOneAndUpdate(
        { _id: orderId, status: "pending" },
        { status: "accepted", driverId: driver._id, acceptedAt: new Date() },
        { new: true },
      );

      if (!order) {
        await ctx.deleteMessage().catch(() => {});
        return ctx.answerCbQuery(
          "\u274C Kechirasiz, bu buyurtmani boshqa haydovchi olib bo'ldi.",
          { show_alert: true },
        );
      }

      await ctx.editMessageText(
        `\u2705 <b>Buyurtma qabul qilindi!</b>\n\n` +
          `\uD83D\uDC64 <b>Yo'lovchi:</b> ${order.firstName}\n` +
          `\uD83D\uDCF1 <b>Tel:</b> +${order.phoneNumber}\n\n` +
          `\uD83D\uDCCD <a href="https://www.google.com/maps?q=${order.latitude},${order.longitude}">Xaritada ko'rish</a>\n\n` +
          `<b>Yo'lga chiqing.</b>`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "\uD83D\uDCF1 Ilovani ochish",
                  web_app: {
                    url: buildDriverWebAppUrl(
                      order._id,
                      driverTelegramId,
                      driver.firstName,
                      driverPhotoUrl,
                    ),
                  },
                },
              ],
            ],
          },
        },
      );

      await safeSendMessage(
        bot.telegram,
        order.userId,
        `\uD83D\uDE95 <b>Xushxabar!</b>\n\nHaydovchi topildi!\n\uD83D\uDC64 Ismi: ${driver.firstName}\n\uD83D\uDCF1 Tel: +${driver.phoneNumber}\n\nHaydovchi siz tomonga yo'lga chiqdi.`,
        { parse_mode: "HTML" },
      );

      await ctx.answerCbQuery("Buyurtma biriktirildi!");
    } catch (err) {
      console.error("Accept order xatosi:", err);
      await ctx.answerCbQuery("Xatolik yuz berdi.");
    }
  });

  bot.action(/cancel_order_(.+)/, async (ctx) => {
    const orderId = ctx.match[1];

    try {
      const order = await Order.findOne({
        _id: orderId,
        userId: String(ctx.from.id),
      });

      if (!order) {
        return ctx.answerCbQuery("Bu buyurtmani bekor qilishga ruxsat yo'q.", {
          show_alert: true,
        });
      }

      await Order.deleteOne({ _id: orderId });
      await ctx.editMessageText("\u274C Buyurtma bekor qilindi.");
      await ctx.answerCbQuery("Buyurtma o'chirildi");
    } catch (error) {
      console.error("Cancel error:", error);
      await ctx.answerCbQuery("Xatolik yuz berdi.");
    }
  });
}
