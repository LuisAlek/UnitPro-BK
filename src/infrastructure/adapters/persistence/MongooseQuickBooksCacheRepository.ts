import { QuickBooksCache } from "../../../core/domain/entities/QuickBooksCache";
import { IQuickBooksCacheRepository } from "../../../core/domain/ports/IQuickBooksCacheRepository";
import { QuickBooksCacheModel, IQuickBooksCacheDocument } from "./models/QuickBooksCacheModel";

export class MongooseQuickBooksCacheRepository implements IQuickBooksCacheRepository {
  private toDomain(doc: IQuickBooksCacheDocument): QuickBooksCache {
    return {
      id: doc._id.toString(),
      userId: doc.userId,
      items: doc.items || {},
      classes: doc.classes || {},
      customers: doc.customers || {},
      vendors: doc.vendors || {},
      updatedAt: doc.updatedAt,
    };
  }

  async findByUserId(userId: string): Promise<QuickBooksCache | null> {
    const doc = await QuickBooksCacheModel.findOne({ userId });
    return doc ? this.toDomain(doc) : null;
  }

  async save(cache: QuickBooksCache): Promise<QuickBooksCache> {
    const existing = await QuickBooksCacheModel.findOne({ userId: cache.userId });
    if (existing) {
      existing.items = cache.items;
      existing.classes = cache.classes;
      existing.customers = cache.customers;
      existing.vendors = cache.vendors;
      await existing.save();
      return this.toDomain(existing);
    }
    const doc = await QuickBooksCacheModel.create({
      userId: cache.userId,
      items: cache.items,
      classes: cache.classes,
      customers: cache.customers,
      vendors: cache.vendors,
    });
    return this.toDomain(doc);
  }
}
