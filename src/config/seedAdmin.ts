import crypto from "crypto";
import { TeamModel } from "../infrastructure/adapters/persistence/models/TeamModel";

function generateInviteCode(): string {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

export async function migrateTeams(): Promise<void> {
  const teamsWithoutCode = await TeamModel.find({ inviteCode: { $exists: false } });
  for (const team of teamsWithoutCode) {
    let code = generateInviteCode();
    while (await TeamModel.findOne({ inviteCode: code })) {
      code = generateInviteCode();
    }
    team.inviteCode = code;
    team.isPublic = false;
    team.joinRequests = [];
    await team.save();
    console.log(`  Migrated team "${team.name}" → code: ${code}`);
  }
  if (teamsWithoutCode.length > 0) {
    console.log(`Migrated ${teamsWithoutCode.length} teams without inviteCode`);
  }
}
