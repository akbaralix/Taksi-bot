import Order from "../models/Order.js";

export async function createDraftOrder(user, note) {
  return Order.create({
    user: user._id,
    userId: String(user.telegramId),
    firstName: user.firstName,
    address: user.address,
    latitude: user.location.latitude,
    longitude: user.location.longitude,
    phoneNumber: user.phoneNumber,
    note,
    status: "draft",
  });
}

export function buildOrderPreviewMessage(order) {
  return (
    `рџ“ќ <b>Buyurtma ma'lumotlari:</b>\n\n` +
    `рџ“Ќ <b>Manzil:</b> ${order.address}\n` +
    `рџ“ћ <b>Tel:</b> +${order.phoneNumber}\n` +
    `рџ‘¤ <b>Ism:</b> ${order.firstName}\n` +
    `рџ’¬ <b>Izoh:</b> ${order.note}\n\n` +
    `<i>Ma'lumotlar to'g'rimi?</i>`
  );
}
