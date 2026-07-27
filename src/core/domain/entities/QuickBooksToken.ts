export interface QuickBooksToken {
  id?: string;
  userId: string;
  realmId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}
