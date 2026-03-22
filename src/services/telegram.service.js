import User from "../models/User.js";

export function isBlockedByUserError(error) {
  const description = error?.response?.description || error?.description || "";
  const errorCode = error?.response?.error_code || error?.code;

  return (
    errorCode === 403 ||
    description.includes("bot was blocked by the user") ||
    description.includes("user is deactivated") ||
    description.includes("chat not found")
  );
}

export async function markUserBlocked(telegramId) {
  await User.findOneAndUpdate(
    { telegramId: Number(telegramId) },
    { isBlocked: true, blockedAt: new Date() },
  );
}

export async function markUserActive(from) {
  if (!from?.id) return;

  await User.findOneAndUpdate(
    { telegramId: from.id },
    {
      telegramId: from.id,
      firstName: from.first_name,
      username: from.username,
      isBlocked: false,
      blockedAt: null,
      lastSeenAt: new Date(),
    },
    { upsert: true },
  );
}

export async function safeSendMessage(telegram, telegramId, text, extra = {}) {
  try {
    return await telegram.sendMessage(telegramId, text, extra);
  } catch (error) {
    if (isBlockedByUserError(error)) {
      await markUserBlocked(telegramId);
      return null;
    }

    throw error;
  }
}

export async function safeCopyMessage(
  telegram,
  toChatId,
  fromChatId,
  messageId,
  extra = {},
) {
  try {
    return await telegram.copyMessage(toChatId, fromChatId, messageId, extra);
  } catch (error) {
    if (isBlockedByUserError(error)) {
      await markUserBlocked(toChatId);
      return null;
    }

    throw error;
  }
}
