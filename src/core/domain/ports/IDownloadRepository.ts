import { Download } from "../entities/Download";

export interface IDownloadRepository {
  findAllByUser(userId: string): Promise<Download[]>;
  findById(id: string): Promise<Download | null>;
  create(data: Omit<Download, "id" | "createdAt">): Promise<Download>;
}
