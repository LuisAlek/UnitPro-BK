import mongoose, { Schema, Document } from "mongoose";

export interface IJoinRequestDocument {
  userId: string;
  email: string;
  status: "pending" | "approved" | "rejected";
  requestedAt: Date;
}

export interface ITeamDocument extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  memberIds: string[];
  createdBy: string;
  inviteCode: string;
  isPublic: boolean;
  joinRequests: IJoinRequestDocument[];
  createdAt: Date;
  updatedAt: Date;
}

const joinRequestSchema = new Schema<IJoinRequestDocument>(
  {
    userId: { type: String, required: true },
    email: { type: String, required: true },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    requestedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const teamSchema = new Schema<ITeamDocument>(
  {
    name: { type: String, required: true, trim: true },
    memberIds: [{ type: String, required: true }],
    createdBy: { type: String, required: true },
    inviteCode: { type: String, required: true, unique: true },
    isPublic: { type: Boolean, default: false },
    joinRequests: { type: [joinRequestSchema], default: [] },
  },
  { timestamps: true }
);

teamSchema.index({ inviteCode: 1 });

export const TeamModel = mongoose.model<ITeamDocument>("Team", teamSchema);
