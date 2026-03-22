import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true, unique: true },
  firstName: String,
  username: String,
  phoneNumber: String,
  userRole: String,
  tempData: String,
  subscriptionUntil: { type: Date, default: null },
  role: { type: String, enum: ["client", "driver"], default: "client" },
  isOnline: { type: Boolean, default: false },
  isBlocked: { type: Boolean, default: false },
  blockedAt: { type: Date, default: null },
  lastSeenAt: { type: Date, default: Date.now },
  step: { type: String, default: "start" }, // Yangi qator
  address: String,
  balance: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  location: {
    latitude: Number,
    longitude: Number,
  },
});

export default mongoose.model("User", userSchema);
