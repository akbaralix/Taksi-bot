import mongoose from "mongoose";

const orderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  userId: String,
  address: String,
  latitude: Number,
  longitude: Number,
  phoneNumber: String,
  firstName: String,
  status: {
    type: String,
    enum: ["draft", "pending", "accepted", "completed"],
    default: "draft",
  },
  driverId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  notifiedDrivers: [{ type: Number }],
  note: String,
  tripDistanceKm: { type: Number, default: 0 },
  tripDurationSec: { type: Number, default: 0 },
  tripPrice: { type: Number, default: 0 },
  acceptedAt: Date,
  completedAt: Date,
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Order", orderSchema);
