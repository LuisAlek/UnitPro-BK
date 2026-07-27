import { QuickBooksCache } from "../entities/QuickBooksCache";

export interface IQuickBooksCacheRepository {
  findByUserId(userId: string): Promise<QuickBooksCache | null>;
  save(cache: QuickBooksCache): Promise<QuickBooksCache>;
}
