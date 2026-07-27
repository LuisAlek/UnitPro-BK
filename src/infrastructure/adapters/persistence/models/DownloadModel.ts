import mongoose, { Schema, Document } from "mongoose";

export interface IDownloadDocument extends Document {
  _id: mongoose.Types.ObjectId;
  userId: string;
  filename: string;
  rowCount: number;
  createdAt: Date;
}

const downloadSchema = new Schema<IDownloadDocument>(
  {
    userId: { type: String, required: true, index: true },
    filename: { type: String, required: true },
    rowCount: { type: Number, required: true },
  },
  { timestamps: true }
);

export const DownloadModel = mongoose.model<IDownloadDocument>("Download", downloadSchema);
