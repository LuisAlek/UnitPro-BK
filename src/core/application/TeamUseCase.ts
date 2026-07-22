import { ITeamRepository } from "../domain/ports/ITeamRepository";
import { IUserRepository } from "../domain/ports/IUserRepository";
import { Team, CreateTeamDTO, TeamResponse, JoinRequest } from "../domain/entities/Team";
import crypto from "crypto";

function generateInviteCode(): string {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

export class TeamUseCase {
  constructor(
    private teamRepo: ITeamRepository,
    private userRepo: IUserRepository
  ) {}

  async create(dto: CreateTeamDTO, userId: string): Promise<TeamResponse> {
    let inviteCode = generateInviteCode();
    while (await this.teamRepo.findByInviteCode(inviteCode)) {
      inviteCode = generateInviteCode();
    }

    const team = await this.teamRepo.create({
      name: dto.name,
      memberIds: [userId],
      createdBy: userId,
      inviteCode,
      isPublic: dto.isPublic || false,
      joinRequests: [],
    });

    const user = await this.userRepo.findById(userId);
    if (user) {
      await this.userRepo.update(userId, { teamIds: [...user.teamIds, team.id!] });
    }

    return team;
  }

  async getMyTeams(userId: string): Promise<TeamResponse[]> {
    return this.teamRepo.findByUserId(userId);
  }

  async getById(id: string): Promise<TeamResponse | null> {
    return this.teamRepo.findById(id);
  }

  async update(id: string, data: Partial<Team>, userId: string): Promise<TeamResponse | null> {
    const team = await this.teamRepo.findById(id);
    if (!team) throw new Error("Team not found");
    if (team.createdBy !== userId) throw new Error("Only the team creator can update");

    const oldMemberIds = team.memberIds;
    const updateData: Partial<Team> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.isPublic !== undefined) updateData.isPublic = data.isPublic;
    if (data.memberIds !== undefined) updateData.memberIds = data.memberIds;
    const updated = await this.teamRepo.update(id, updateData);

    const newMemberIds = (data.memberIds || oldMemberIds);
    for (const mid of oldMemberIds) {
      if (!newMemberIds.includes(mid)) {
        const user = await this.userRepo.findById(mid);
        if (user) {
          await this.userRepo.update(mid, { teamIds: user.teamIds.filter((t) => t !== id) });
        }
      }
    }
    for (const mid of newMemberIds) {
      if (!oldMemberIds.includes(mid)) {
        const user = await this.userRepo.findById(mid);
        if (user) {
          await this.userRepo.update(mid, { teamIds: [...new Set([...user.teamIds, id])] });
        }
      }
    }

    return updated;
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const team = await this.teamRepo.findById(id);
    if (!team) throw new Error("Team not found");
    if (team.createdBy !== userId) throw new Error("Only the team creator can delete");

    for (const mid of team.memberIds) {
      const user = await this.userRepo.findById(mid);
      if (user) {
        await this.userRepo.update(mid, { teamIds: user.teamIds.filter((t) => t !== id) });
      }
    }

    return this.teamRepo.delete(id);
  }

  async joinByCode(code: string, userId: string): Promise<TeamResponse> {
    const team = await this.teamRepo.findByInviteCode(code);
    if (!team) throw new Error("Invalid invite code");
    if (team.memberIds.includes(userId)) throw new Error("You are already a member of this team");

    const user = await this.userRepo.findById(userId);
    if (!user) throw new Error("User not found");

    await this.teamRepo.addMember(team.id!, userId);
    await this.userRepo.update(userId, { teamIds: [...new Set([...user.teamIds, team.id!])] });

    return (await this.teamRepo.findById(team.id!))!;
  }

  async getPublicTeams(userId: string): Promise<TeamResponse[]> {
    const user = await this.userRepo.findById(userId);
    const userTeamIds = user?.teamIds || [];
    return this.teamRepo.findPublicTeams(userTeamIds);
  }

  async requestJoin(teamId: string, userId: string): Promise<TeamResponse> {
    const team = await this.teamRepo.findById(teamId);
    if (!team) throw new Error("Team not found");
    if (!team.isPublic) throw new Error("This team is not public");
    if (team.memberIds.includes(userId)) throw new Error("You are already a member");
    if (team.joinRequests.some((jr) => jr.userId === userId && jr.status === "pending")) {
      throw new Error("You already have a pending request");
    }

    const user = await this.userRepo.findById(userId);
    if (!user) throw new Error("User not found");

    const joinRequest: JoinRequest = {
      userId,
      email: user.email,
      status: "pending",
      requestedAt: new Date(),
    };

    const updated = await this.teamRepo.addJoinRequest(teamId, joinRequest);
    if (!updated) throw new Error("Failed to send join request");
    return updated;
  }

  async approveRequest(teamId: string, requesterUserId: string, approverUserId: string): Promise<TeamResponse> {
    const team = await this.teamRepo.findById(teamId);
    if (!team) throw new Error("Team not found");
    if (team.createdBy !== approverUserId) throw new Error("Only the team creator can approve requests");

    const request = team.joinRequests.find((jr) => jr.userId === requesterUserId && jr.status === "pending");
    if (!request) throw new Error("No pending request from this user");

    await this.teamRepo.updateJoinRequestStatus(teamId, requesterUserId, "approved");
    await this.teamRepo.addMember(teamId, requesterUserId);

    const user = await this.userRepo.findById(requesterUserId);
    if (user) {
      await this.userRepo.update(requesterUserId, { teamIds: [...new Set([...user.teamIds, teamId])] });
    }

    return (await this.teamRepo.findById(teamId))!;
  }

  async rejectRequest(teamId: string, requesterUserId: string, rejectorUserId: string): Promise<TeamResponse> {
    const team = await this.teamRepo.findById(teamId);
    if (!team) throw new Error("Team not found");
    if (team.createdBy !== rejectorUserId) throw new Error("Only the team creator can reject requests");

    const request = team.joinRequests.find((jr) => jr.userId === requesterUserId && jr.status === "pending");
    if (!request) throw new Error("No pending request from this user");

    await this.teamRepo.updateJoinRequestStatus(teamId, requesterUserId, "rejected");
    return (await this.teamRepo.findById(teamId))!;
  }

  async getJoinRequests(teamId: string, userId: string): Promise<JoinRequest[]> {
    const team = await this.teamRepo.findById(teamId);
    if (!team) throw new Error("Team not found");
    if (team.createdBy !== userId) throw new Error("Only the team creator can view requests");
    return team.joinRequests.filter((jr) => jr.status === "pending");
  }
}