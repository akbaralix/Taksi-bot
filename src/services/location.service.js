import User from "../models/User.js";

function formatAddress(address = {}, displayName = "") {
  const region = address.state;
  const district = address.county || address.city_district || address.city;

  let village =
    address.village ||
    address.hamlet ||
    address.suburb ||
    address.neighbourhood;

  if (!village && displayName) {
    const parts = displayName.split(",");
    village = parts[0]?.trim();
  }

  return [region, district, village].filter(Boolean).join(", ");
}

async function getAddress(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=19&addressdetails=1`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "TaksiBot/1.0",
        "Accept-Language": "uz",
      },
    });

    if (!res.ok) {
      console.warn(`Geocoding warning: status ${res.status}`);
      return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
    }

    const data = await res.json();
    return formatAddress(data.address, data.display_name);
  } catch (err) {
    console.error("Geocoding fetch error:", err.message);
    return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  }
}

export async function saveUserLocation(ctx) {
  if (!ctx.message?.location) {
    return { ok: false, reason: "missing_location" };
  }

  const { latitude, longitude } = ctx.message.location;
  const telegramId = ctx.from.id;
  const address = await getAddress(latitude, longitude);

  let user = await User.findOne({ telegramId });

  if (!user) {
    user = new User({
      telegramId,
      firstName: ctx.from.first_name || "Foydalanuvchi",
      username: ctx.from.username || "",
      phoneNumber: "",
    });
  }

  user.location = { latitude, longitude };
  user.address = address;
  await user.save();

  return { ok: true, user, address };
}

export default async function locationHandler(ctx) {
  try {
    const result = await saveUserLocation(ctx);

    if (!result.ok) {
      return result;
    }

    await ctx.reply(
      `*Turgan joyingiz:* ${result.address}\n\n_Endi boradigan manzilingizni yoki haydovchi uchun qisqacha izoh yozib yuboring:_`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          keyboard: [[{ text: "⬅️ Orqaga" }]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      },
    );

    return result;
  } catch (err) {
    console.error("Location saqlash xato:", err);
    await ctx.reply("⚠️ Joy nomini aniqlab bolmadi.");
    return { ok: false, reason: "geocode_failed" };
  }
}
