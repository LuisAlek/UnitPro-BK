import { IUserRepository } from "../../../core/domain/ports/IUserRepository";
import { User } from "../../../core/domain/entities/User";
import { UserModel, IUserDocument } from "./models/UserModel";

export class MongooseUserRepository implements IUserRepository {
  private toDomain(doc: IUserDocument): User {
    return {
      id: doc._id.toString(),
      email: doc.email,
      passwordHash: doc.passwordHash,
      name: doc.name,
      role: doc.role || "user",
      teamIds: doc.teamIds || [],
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async findByEmail(email: string): Promise<User | null> {
    const doc = await UserModel.findOne({ email: email.toLowerCase() });
    return doc ? this.toDomain(doc) : null;
  }

  async findById(id: string): Promise<User | null> {
    const doc = await UserModel.findById(id);
    return doc ? this.toDomain(doc) : null;
  }

  async findByIds(ids: string[]): Promise<User[]> {
    const docs = await UserModel.find({ _id: { $in: ids } });
    return docs.map((d) => this.toDomain(d));
  }

  async findAdmin(): Promise<User | null> {
    const doc = await UserModel.findOne({ role: "admin" });
    return doc ? this.toDomain(doc) : null;
  }

  async searchUsers(query: string): Promise<User[]> {
    const regex = new RegExp(query, "i");
    const docs = await UserModel.find({
      $or: [{ name: regex }, { email: regex }],
    }).limit(20);
    return docs.map((d) => this.toDomain(d));
  }

  async create(data: Omit<User, "id" | "createdAt" | "updatedAt">): Promise<User> {
    const doc = await UserModel.create(data);
    return this.toDomain(doc);
  }

  async update(id: string, data: Partial<User>): Promise<User> {
    const doc = await UserModel.findByIdAndUpdate(id, { $set: data }, { new: true });
    if (!doc) throw new Error("User not found");
    return this.toDomain(doc);
  }
}
