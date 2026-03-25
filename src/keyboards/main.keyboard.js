import { BUTTONS } from "../config/text.js";

const keyboards = {
  mainKeyboard: {
    keyboard: [[BUTTONS.callTaxi, BUTTONS.becomeDriver]],
    resize_keyboard: true,
  },

  phoneKeyboard: {
    keyboard: [[{ text: BUTTONS.sendPhone, request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  },
};

export function getMainKeyboard(telegramId) {
  if (String(telegramId) === String(process.env.ADMIN_ID)) {
    return {
      keyboard: [
        [BUTTONS.callTaxi, BUTTONS.becomeDriver],
        [BUTTONS.adminPanel],
      ],
      resize_keyboard: true,
    };
  }

  return keyboards.mainKeyboard;
}

export default keyboards;
