import { Task } from "../entities/Task";

export interface ITaskRepository {
  findAllByTeam(teamId: string): Promise<Task[]>;
  findAllByUser(userId: string): Promise<Task[]>;
  findById(id: string): Promise<Task | null>;
  create(data: Omit<Task, "id" | "createdAt" | "updatedAt">): Promise<Task>;
  update(id: string, data: Partial<Task>): Promise<Task | null>;
  delete(id: string): Promise<boolean>;
}
