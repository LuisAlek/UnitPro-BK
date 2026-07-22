import { ITaskRepository } from "../../../core/domain/ports/ITaskRepository";
import { Task } from "../../../core/domain/entities/Task";
import { TaskModel, ITaskDocument } from "./models/TaskModel";

export class MongooseTaskRepository implements ITaskRepository {
  private toDomain(doc: ITaskDocument): Task {
    return {
      id: doc._id.toString(),
      teamId: doc.teamId,
      userId: doc.userId,
      title: doc.title,
      description: doc.description,
      status: doc.status,
      assignedTo: doc.assignedTo,
      createdBy: doc.createdBy,
      isPrivate: doc.isPrivate,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async findAllByTeam(teamId: string): Promise<Task[]> {
    const docs = await TaskModel.find({ teamId }).sort({ createdAt: -1 });
    return docs.map(d => this.toDomain(d));
  }

  async findAllByUser(userId: string): Promise<Task[]> {
    const docs = await TaskModel.find({ userId }).sort({ createdAt: -1 });
    return docs.map(d => this.toDomain(d));
  }

  async findById(id: string): Promise<Task | null> {
    const doc = await TaskModel.findById(id);
    return doc ? this.toDomain(doc) : null;
  }

  async create(data: Omit<Task, "id" | "createdAt" | "updatedAt">): Promise<Task> {
    const doc = await TaskModel.create(data);
    return this.toDomain(doc);
  }

  async update(id: string, data: Partial<Task>): Promise<Task | null> {
    const doc = await TaskModel.findByIdAndUpdate(id, { $set: data }, { new: true });
    return doc ? this.toDomain(doc) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await TaskModel.findByIdAndDelete(id);
    return result !== null;
  }
}
