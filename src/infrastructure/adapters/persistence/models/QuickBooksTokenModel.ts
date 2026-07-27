import mongoose, { Schema, Document } from "mongoose";

export interface IQuickBooksTokenDocument extends Document {
  userId: string;
  realmId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const quickBooksTokenSchema = new Schema<IQuickBooksTokenDocument>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    realmId: { type: String, required: true },
    accessToken: { type: String, required: true },
    refreshToken: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

export const QuickBooksTokenModel = mongoose.model<IQuickBooksTokenDocument>("QuickBooksToken", quickBooksTokenSchema);
