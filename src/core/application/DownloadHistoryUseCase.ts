import { IDownloadRepository } from "../domain/ports/IDownloadRepository";
import { CreateDownloadDTO, Download } from "../domain/entities/Download";

export class DownloadHistoryUseCase {
  constructor(private downloadRepository: IDownloadRepository) {}

  async getAll(userId: string): Promise<Download[]> {
    return this.downloadRepository.findAllByUser(userId);
  }

  async create(dto: CreateDownloadDTO, userId: string): Promise<Download> {
    return this.downloadRepository.create({
      userId,
      filename: dto.filename,
      rowCount: dto.rowCount,
    });
  }
}
