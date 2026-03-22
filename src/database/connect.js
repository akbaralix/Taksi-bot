import mongoose from "mongoose";
import "dotenv/config";

const connectDB = async () => {
  const url = process.env.MONGO_URL;

  if (!url) {
    throw new Error("MONGO_URL .env faylida topilmadi!");
  }

  try {
    await mongoose.connect(url);
    console.log("MongoDB-ga muvaffaqiyatli ulandik");
  } catch (error) {
    if (error?.code === "ENOTFOUND" && url.startsWith("mongodb+srv://")) {
      console.error(
        "Baza bilan xatolik: MongoDB SRV host topilmadi. Atlas'dan yangi connection string oling yoki oddiy mongodb:// formatidan foydalaning.",
      );
    } else {
      console.error("Baza bilan xatolik:", error.message);
    }
    throw error;
  }
};

export default connectDB;
