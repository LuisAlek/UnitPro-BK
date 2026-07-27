export interface Download {
  id?: string;
  userId: string;
  filename: string;
  rowCount: number;
  createdAt?: Date;
}

export type CreateDownloadDTO = {
  filename: string;
  rowCount: number;
};
