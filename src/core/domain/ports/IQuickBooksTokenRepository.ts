import { QuickBooksToken } from "../entities/QuickBooksToken";

export interface IQuickBooksTokenRepository {
  findByUserId(userId: string): Promise<QuickBooksToken | null>;
  save(token: QuickBooksToken): Promise<QuickBooksToken>;
  deleteByUserId(userId: string): Promise<void>;
}
