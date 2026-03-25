import { BUTTONS } from "../config/text.js";

const adminKeyboard = {
  keyboard: [
    [BUTTONS.activeUsers, BUTTONS.activeDrivers],
    [BUTTONS.blockedUsers, BUTTONS.broadcast],
    [BUTTONS.mainMenu],
  ],
  resize_keyboard: true,
};

export default adminKeyboard;
