import mongoose, { Schema, Document } from "mongoose";

export interface IReservationDocument extends Document {
  userId: string;
  confirmationCode: string;
  propertyId: string;
  guest: string;
  checkIn: string;
  total: number;
  month: string;
  monthYear: string;
  processedAt: Date;
}

const ReservationSchema = new Schema<IReservationDocument>({
  userId: { type: String, required: true, index: true },
  confirmationCode: { type: String, required: true },
  propertyId: { type: String, required: true },
  guest: { type: String, required: true },
  checkIn: { type: String, required: true },
  total: { type: Number, required: true },
  month: { type: String, required: true },
  monthYear: { type: String, required: true },
  processedAt: { type: Date, default: Date.now },
});

ReservationSchema.index({ userId: 1, confirmationCode: 1, monthYear: 1 }, { unique: true });

export const ReservationModel = mongoose.model<IReservationDocument>("Reservation", ReservationSchema);
