export interface ReservationRecord {
  id?: string;
  userId: string;
  confirmationCode: string;
  propertyId: string;
  guest: string;
  checkIn: string;
  total: number;
  month: string;
  monthYear: string;
  processedAt?: Date;
}
