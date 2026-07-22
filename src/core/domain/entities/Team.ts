export interface JoinRequest {
  userId: string;
  email: string;
  status: "pending" | "approved" | "rejected";
  requestedAt: Date;
}

export interface Team {
  id?: string;
  name: string;
  memberIds: string[];
  createdBy: string;
  inviteCode: string;
  isPublic: boolean;
  joinRequests: JoinRequest[];
  createdAt?: Date;
  updatedAt?: Date;
}

export type CreateTeamDTO = {
  name: string;
  isPublic?: boolean;
};

export type TeamResponse = Team;
