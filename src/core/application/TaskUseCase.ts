import { ITaskRepository } from "../domain/ports/ITaskRepository";
import { ITeamRepository } from "../domain/ports/ITeamRepository";
import { Task, CreateTaskDTO, UpdateTaskDTO } from "../domain/entities/Task";

export class TaskUseCase {
  constructor(
    private taskRepo: ITaskRepository,
    private teamRepo?: ITeamRepository
  ) {}

  async getTeamTasks(teamId: string, userId: string): Promise<Task[]> {
    const tasks = await this.taskRepo.findAllByTeam(teamId);
    const team = await this.teamRepo?.findById(teamId);
    const isLeader = team?.createdBy === userId;

    return tasks.filter((t) => {
      if (t.createdBy === userId) return true;
      if (!t.isPrivate) return true;
      if (isLeader) return true;
      return false;
    });
  }

  async getPersonalTasks(userId: string): Promise<Task[]> {
    return this.taskRepo.findAllByUser(userId);
  }

  async createForTeam(dto: CreateTaskDTO, teamId: string, userId: string): Promise<Task> {
    return this.taskRepo.create({
      teamId,
      title: dto.title,
      description: dto.description,
      status: dto.status || "pending",
      assignedTo: dto.assignedTo,
      createdBy: userId,
      isPrivate: dto.isPrivate || false,
    });
  }

  async createPersonal(dto: CreateTaskDTO, userId: string): Promise<Task> {
    return this.taskRepo.create({
      userId,
      title: dto.title,
      description: dto.description,
      status: dto.status || "pending",
      createdBy: userId,
      isPrivate: false,
    });
  }

  async update(id: string, dto: UpdateTaskDTO): Promise<Task | null> {
    return this.taskRepo.update(id, dto);
  }

  async updateStatus(id: string, status: "pending" | "in-progress" | "done"): Promise<Task | null> {
    return this.taskRepo.update(id, { status });
  }

  async delete(id: string): Promise<boolean> {
    return this.taskRepo.delete(id);
  }
}
