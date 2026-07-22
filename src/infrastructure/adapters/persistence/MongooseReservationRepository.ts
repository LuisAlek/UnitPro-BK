import { IReservationRepository } from "../../../core/domain/ports/IReservationRepository";
import { ReservationRecord } from "../../../core/domain/entities/ReservationRecord";
import { ReservationModel, IReservationDocument } from "./models/ReservationModel";

export class MongooseReservationRepository implements IReservationRepository {
  private toDomain(doc: IReservationDocument): ReservationRecord {
    return {
      id: doc._id.toString(),
      userId: doc.userId,
      confirmationCode: doc.confirmationCode,
      propertyId: doc.propertyId,
      guest: doc.guest,
      checkIn: doc.checkIn,
      total: doc.total,
      month: doc.month,
      monthYear: doc.monthYear,
      processedAt: doc.processedAt,
    };
  }

  async findByConfirmationCode(userId: string, confirmationCode: string, monthYear: string): Promise<ReservationRecord | null> {
    const doc = await ReservationModel.findOne({ userId, confirmationCode, monthYear });
    return doc ? this.toDomain(doc) : null;
  }

  async findExistingByUser(userId: string): Promise<string[]> {
    const docs = await ReservationModel.find({ userId }, { confirmationCode: 1, monthYear: 1, _id: 0 });
    return docs.map(d => `${d.confirmationCode}_${d.monthYear}`);
  }

  async create(data: Omit<ReservationRecord, "id" | "processedAt">): Promise<ReservationRecord> {
    const doc = await ReservationModel.create(data);
    return this.toDomain(doc);
  }

  async createMany(data: Omit<ReservationRecord, "id" | "processedAt">[]): Promise<ReservationRecord[]> {
    const docs = await ReservationModel.insertMany(data);
    return docs.map(d => this.toDomain(d));
  }
}
