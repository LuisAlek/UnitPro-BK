import dotenv from "dotenv";
dotenv.config();

export const env = {
  PORT: parseInt(process.env.PORT || "4000", 10),
  MONGODB_URI: process.env.MONGODB_URI || "mongodb://localhost:27017/script-miami",
  JWT_SECRET: process.env.JWT_SECRET || "dev-secret",
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:5173",
};
