import { IDownloadRepository } from "../../../core/domain/ports/IDownloadRepository";
import { Download } from "../../../core/domain/entities/Download";
import { DownloadModel, IDownloadDocument } from "./models/DownloadModel";

export class MongooseDownloadRepository implements IDownloadRepository {
  private toDomain(doc: IDownloadDocument): Download {
    return {
      id: doc._id.toString(),
      userId: doc.userId,
      filename: doc.filename,
      rowCount: doc.rowCount,
      csvContent: doc.csvContent,
      createdAt: doc.createdAt,
    };
  }

  async findAllByUser(userId: string): Promise<Download[]> {
    const docs = await DownloadModel.find({ userId }).sort({ createdAt: -1 });
    return docs.map(d => this.toDomain(d));
  }

  async findById(id: string): Promise<Download | null> {
    const doc = await DownloadModel.findById(id);
    return doc ? this.toDomain(doc) : null;
  }

  async create(data: Omit<Download, "id" | "createdAt">): Promise<Download> {
    const doc = await DownloadModel.create(data);
    return this.toDomain(doc);
  }
}
