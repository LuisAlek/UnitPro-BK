import { IEquivalenceRepository } from "../../../core/domain/ports/IEquivalenceRepository";
import { Equivalence } from "../../../core/domain/entities/Equivalence";
import { EquivalenceModel, IEquivalenceDocument } from "./models/EquivalenceModel";

export class MongooseEquivalenceRepository implements IEquivalenceRepository {
  private toDomain(doc: IEquivalenceDocument): Equivalence {
    return {
      id: doc._id.toString(),
      adTitle: doc.adTitle,
      propertyId: doc.propertyId,
      userId: doc.userId,
      teamId: doc.teamId,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async findAll(): Promise<Equivalence[]> {
    const docs = await EquivalenceModel.find().sort({ createdAt: -1 });
    return docs.map(d => this.toDomain(d));
  }

  async findAllByUser(userId: string): Promise<Equivalence[]> {
    const docs = await EquivalenceModel.find({ userId }).sort({ createdAt: -1 });
    return docs.map(d => this.toDomain(d));
  }

  async findAllByTeam(teamId: string): Promise<Equivalence[]> {
    const docs = await EquivalenceModel.find({ teamId }).sort({ createdAt: -1 });
    return docs.map(d => this.toDomain(d));
  }

  async findById(id: string): Promise<Equivalence | null> {
    const doc = await EquivalenceModel.findById(id);
    return doc ? this.toDomain(doc) : null;
  }

  async create(data: Omit<Equivalence, "id" | "createdAt" | "updatedAt">): Promise<Equivalence> {
    const doc = await EquivalenceModel.create(data);
    return this.toDomain(doc);
  }

  async update(id: string, data: Partial<Equivalence>): Promise<Equivalence | null> {
    const doc = await EquivalenceModel.findByIdAndUpdate(id, { $set: data }, { new: true });
    return doc ? this.toDomain(doc) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await EquivalenceModel.findByIdAndDelete(id);
    return result !== null;
  }

  async deleteAllByUser(userId: string): Promise<number> {
    const result = await EquivalenceModel.deleteMany({ userId });
    return result.deletedCount || 0;
  }

  async deleteAllByTeam(teamId: string): Promise<number> {
    const result = await EquivalenceModel.deleteMany({ teamId });
    return result.deletedCount || 0;
  }
}
