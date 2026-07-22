import bcrypt from "bcryptjs";
import crypto from "crypto";
import { IUserRepository } from "../core/domain/ports/IUserRepository";
import { TeamModel } from "../infrastructure/adapters/persistence/models/TeamModel";

function generateInviteCode(): string {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

export async function seedAdmin(userRepo: IUserRepository): Promise<void> {
  const existing = await userRepo.findByEmail("galoAdmin@gmail.com");
  if (existing) return;

  const passwordHash = await bcrypt.hash("Alejo1618*", 10);
  await userRepo.create({
    email: "galoAdmin@gmail.com",
    passwordHash,
    name: "GaloUP",
    teamIds: [],
  });
  console.log("Admin user 'GaloUP' seeded");
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
