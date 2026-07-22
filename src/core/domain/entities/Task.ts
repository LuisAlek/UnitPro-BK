export interface Task {
  id?: string;
  teamId?: string;
  userId?: string;
  title: string;
  description?: string;
  status: "pending" | "in-progress" | "done";
  assignedTo?: string;
  createdBy: string;
  isPrivate: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type CreateTaskDTO = {
  title: string;
  description?: string;
  status?: "pending" | "in-progress" | "done";
  assignedTo?: string;
  isPrivate?: boolean;
};

export type UpdateTaskDTO = {
  title?: string;
  description?: string;
  status?: "pending" | "in-progress" | "done";
  assignedTo?: string;
  isPrivate?: boolean;
};
