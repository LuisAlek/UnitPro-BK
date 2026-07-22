import { Team, JoinRequest } from "../entities/Team";

export interface ITeamRepository {
  findById(id: string): Promise<Team | null>;
  findByUserId(userId: string): Promise<Team[]>;
  findByInviteCode(code: string): Promise<Team | null>;
  findPublicTeams(excludeUserIds: string[]): Promise<Team[]>;
  create(data: Omit<Team, "id" | "createdAt" | "updatedAt">): Promise<Team>;
  update(id: string, data: Partial<Team>): Promise<Team | null>;
  delete(id: string): Promise<boolean>;
  addJoinRequest(teamId: string, request: JoinRequest): Promise<Team | null>;
  updateJoinRequestStatus(teamId: string, userId: string, status: "approved" | "rejected"): Promise<Team | null>;
  addMember(teamId: string, userId: string): Promise<Team | null>;
}
