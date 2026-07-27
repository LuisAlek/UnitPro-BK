import { QuickBooksToken } from "../../../core/domain/entities/QuickBooksToken";
import { IQuickBooksTokenRepository } from "../../../core/domain/ports/IQuickBooksTokenRepository";
import { QuickBooksTokenModel, IQuickBooksTokenDocument } from "./models/QuickBooksTokenModel";

export class MongooseQuickBooksTokenRepository implements IQuickBooksTokenRepository {
  private toDomain(doc: IQuickBooksTokenDocument): QuickBooksToken {
    return {
      id: doc._id.toString(),
      userId: doc.userId,
      realmId: doc.realmId,
      accessToken: doc.accessToken,
      refreshToken: doc.refreshToken,
      expiresAt: doc.expiresAt,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async findByUserId(userId: string): Promise<QuickBooksToken | null> {
    const doc = await QuickBooksTokenModel.findOne({ userId });
    return doc ? this.toDomain(doc) : null;
  }

  async save(token: QuickBooksToken): Promise<QuickBooksToken> {
    const existing = await QuickBooksTokenModel.findOne({ userId: token.userId });
    if (existing) {
      existing.realmId = token.realmId;
      existing.accessToken = token.accessToken;
      existing.refreshToken = token.refreshToken;
      existing.expiresAt = token.expiresAt;
      await existing.save();
      return this.toDomain(existing);
    }
    const doc = await QuickBooksTokenModel.create({
      userId: token.userId,
      realmId: token.realmId,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt: token.expiresAt,
    });
    return this.toDomain(doc);
  }

  async deleteByUserId(userId: string): Promise<void> {
    await QuickBooksTokenModel.deleteOne({ userId });
  }
}
