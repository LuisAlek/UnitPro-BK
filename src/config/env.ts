import dotenv from "dotenv";
dotenv.config();

export const env = {
  PORT: parseInt(process.env.PORT || "4000", 10),
  MONGODB_URI: process.env.MONGODB_URI || "mongodb://localhost:27017/script-miami",
  JWT_SECRET: process.env.JWT_SECRET || "dev-secret",
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:5173",
  QB_CLIENT_ID: process.env.QB_CLIENT_ID || "",
  QB_CLIENT_SECRET: process.env.QB_CLIENT_SECRET || "",
  QB_REDIRECT_URI: process.env.QB_REDIRECT_URI || "http://localhost:4000/api/quickbooks/callback",
  QB_ENVIRONMENT: (process.env.QB_ENVIRONMENT || "sandbox") as "sandbox" | "production",
};
