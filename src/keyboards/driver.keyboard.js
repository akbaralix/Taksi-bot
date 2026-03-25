import { Markup } from "telegraf";
import { BUTTONS } from "../config/text.js";

export default function getDriverKeyboard() {
  return Markup.keyboard([
    [BUTTONS.stopWork, BUTTONS.account],
    [Markup.button.locationRequest(BUTTONS.refreshLocation)],
    [BUTTONS.back],
  ]).resize();
}
