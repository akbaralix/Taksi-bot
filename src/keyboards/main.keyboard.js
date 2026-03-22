const keyboards = {
  mainKeyboard: {
    keyboard: [["🚕 Taxi chaqirish", "🚖 Haydovchi bo'lish"]],
    resize_keyboard: true,
  },

  phoneKeyboard: {
    keyboard: [
      [{ text: "📞 Telefon raqamni yuborish", request_contact: true }],
    ],
    resize_keyboard: true,
    one_time_keyboard: true,
  },
};

export function getMainKeyboard(telegramId) {
  if (String(telegramId) === String(process.env.ADMIN_ID)) {
    return {
      keyboard: [
        ["🚕 Taxi chaqirish", "🚖 Haydovchi bo'lish"],
        ["🛠 Admin panel"],
      ],
      resize_keyboard: true,
    };
  }

  return keyboards.mainKeyboard;
}

export default keyboards;
