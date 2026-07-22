export interface Download {
  id?: string;
  userId: string;
  filename: string;
  rowCount: number;
  csvContent?: string;
  createdAt?: Date;
}

export type CreateDownloadDTO = {
  filename: string;
  rowCount: number;
  csvContent?: string;
};
