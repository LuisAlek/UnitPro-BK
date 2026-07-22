import { ReservationRecord } from "../entities/ReservationRecord";

export interface IReservationRepository {
  findByConfirmationCode(userId: string, confirmationCode: string, monthYear: string): Promise<ReservationRecord | null>;
  findExistingByUser(userId: string): Promise<string[]>;
  create(data: Omit<ReservationRecord, "id" | "processedAt">): Promise<ReservationRecord>;
  createMany(data: Omit<ReservationRecord, "id" | "processedAt">[]): Promise<ReservationRecord[]>;
}
