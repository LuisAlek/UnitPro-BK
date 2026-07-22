import mongoose, { Schema, Document } from "mongoose";

export interface IEquivalenceDocument extends Document {
  _id: mongoose.Types.ObjectId;
  adTitle: string;
  propertyId: string;
  userId?: string;
  teamId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const equivalenceSchema = new Schema<IEquivalenceDocument>(
  {
    adTitle: { type: String, required: true, trim: true },
    propertyId: { type: String, required: true, trim: true },
    userId: { type: String, index: true, sparse: true },
    teamId: { type: String, index: true, sparse: true },
  },
  { timestamps: true }
);

equivalenceSchema.index({ userId: 1, adTitle: 1 }, { unique: true, sparse: true });
equivalenceSchema.index({ teamId: 1, adTitle: 1 }, { unique: true, sparse: true });

export const EquivalenceModel = mongoose.model<IEquivalenceDocument>("Equivalence", equivalenceSchema);
