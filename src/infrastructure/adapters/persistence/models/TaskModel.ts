import mongoose, { Schema, Document } from "mongoose";

export interface ITaskDocument extends Document {
  _id: mongoose.Types.ObjectId;
  teamId?: string;
  userId?: string;
  title: string;
  description?: string;
  status: "pending" | "in-progress" | "done";
  assignedTo?: string;
  createdBy: string;
  isPrivate: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const taskSchema = new Schema<ITaskDocument>(
  {
    teamId: { type: String, index: true, sparse: true },
    userId: { type: String, index: true, sparse: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    status: { type: String, enum: ["pending", "in-progress", "done"], default: "pending" },
    assignedTo: { type: String },
    createdBy: { type: String, required: true },
    isPrivate: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const TaskModel = mongoose.model<ITaskDocument>("Task", taskSchema);
