import mongoose, { Schema, Document } from "mongoose";

export interface IQuickBooksCacheDocument extends Document {
  userId: string;
  items: Record<string, string>;
  classes: Record<string, string>;
  customers: Record<string, string>;
  vendors: Record<string, string>;
  updatedAt: Date;
}

const quickBooksCacheSchema = new Schema<IQuickBooksCacheDocument>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    items: { type: Schema.Types.Mixed, default: {} },
    classes: { type: Schema.Types.Mixed, default: {} },
    customers: { type: Schema.Types.Mixed, default: {} },
    vendors: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export const QuickBooksCacheModel = mongoose.model<IQuickBooksCacheDocument>("QuickBooksCache", quickBooksCacheSchema);
