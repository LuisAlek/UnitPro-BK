import mongoose, { Schema, Document } from "mongoose";

export interface IUserDocument extends Document {
  _id: mongoose.Types.ObjectId;
  email: string;
  passwordHash: string;
  name: string;
  role: "user" | "admin";
  teamIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUserDocument>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    teamIds: [{ type: String }],
  },
  { timestamps: true }
);

export const UserModel = mongoose.model<IUserDocument>("User", userSchema);
