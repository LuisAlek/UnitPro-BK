import { ITeamRepository } from "../../../core/domain/ports/ITeamRepository";
import { Team, JoinRequest } from "../../../core/domain/entities/Team";
import { TeamModel, ITeamDocument } from "./models/TeamModel";

export class MongooseTeamRepository implements ITeamRepository {
  private toDomain(doc: ITeamDocument): Team {
    return {
      id: doc._id.toString(),
      name: doc.name,
      memberIds: doc.memberIds,
      createdBy: doc.createdBy,
      inviteCode: doc.inviteCode,
      isPublic: doc.isPublic,
      joinRequests: doc.joinRequests.map((jr) => ({
        userId: jr.userId,
        email: jr.email,
        status: jr.status as "pending" | "approved" | "rejected",
        requestedAt: jr.requestedAt,
      })),
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async findById(id: string): Promise<Team | null> {
    const doc = await TeamModel.findById(id);
    return doc ? this.toDomain(doc) : null;
  }

  async findByUserId(userId: string): Promise<Team[]> {
    const docs = await TeamModel.find({ memberIds: userId }).sort({ createdAt: -1 });
    return docs.map((d) => this.toDomain(d));
  }

  async findByInviteCode(code: string): Promise<Team | null> {
    const doc = await TeamModel.findOne({ inviteCode: code });
    return doc ? this.toDomain(doc) : null;
  }

  async findPublicTeams(excludeUserIds: string[]): Promise<Team[]> {
    const docs = await TeamModel.find({
      isPublic: true,
      memberIds: { $nin: excludeUserIds },
    }).sort({ createdAt: -1 });
    return docs.map((d) => this.toDomain(d));
  }

  async create(data: Omit<Team, "id" | "createdAt" | "updatedAt">): Promise<Team> {
    const doc = await TeamModel.create(data);
    return this.toDomain(doc);
  }

  async update(id: string, data: Partial<Team>): Promise<Team | null> {
    const doc = await TeamModel.findByIdAndUpdate(id, { $set: data }, { new: true });
    return doc ? this.toDomain(doc) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await TeamModel.findByIdAndDelete(id);
    return result !== null;
  }

  async addJoinRequest(teamId: string, request: JoinRequest): Promise<Team | null> {
    const doc = await TeamModel.findByIdAndUpdate(
      teamId,
      { $push: { joinRequests: request } },
      { new: true }
    );
    return doc ? this.toDomain(doc) : null;
  }

  async updateJoinRequestStatus(teamId: string, userId: string, status: "approved" | "rejected"): Promise<Team | null> {
    const doc = await TeamModel.findOneAndUpdate(
      { _id: teamId, "joinRequests.userId": userId },
      { $set: { "joinRequests.$.status": status } },
      { new: true }
    );
    return doc ? this.toDomain(doc) : null;
  }

  async addMember(teamId: string, userId: string): Promise<Team | null> {
    const doc = await TeamModel.findByIdAndUpdate(
      teamId,
      { $addToSet: { memberIds: userId } },
      { new: true }
    );
    return doc ? this.toDomain(doc) : null;
  }
}
