export interface QuickBooksCache {
  id?: string;
  userId: string;
  items: Record<string, string>;
  classes: Record<string, string>;
  customers: Record<string, string>;
  vendors: Record<string, string>;
  updatedAt?: Date;
}
