import crypto from "crypto";
import { IEquivalenceRepository } from "../domain/ports/IEquivalenceRepository";
import { CreateEquivalenceDTO, UpdateEquivalenceDTO, Equivalence } from "../domain/entities/Equivalence";
import { defaultEquivalences } from "../../config/defaultEquivalences";

export class ManageEquivalencesUseCase {
  constructor(private equivalenceRepository: IEquivalenceRepository) {}

  async getAll(userId?: string): Promise<Equivalence[]> {
    if (userId) return this.equivalenceRepository.findAllByUser(userId);
    return this.getAllPublic();
  }

  async getAllPublic(): Promise<Equivalence[]> {
    const dbEquivalences = await this.equivalenceRepository.findAll();
    const dbByTitle = new Map(dbEquivalences.map((e) => [e.adTitle, e]));

    const merged: Equivalence[] = [];
    const seenTitles = new Set<string>();

    for (const def of defaultEquivalences) {
      seenTitles.add(def.adTitle);
      const dbEntry = dbByTitle.get(def.adTitle);
      if (dbEntry) {
        merged.push(dbEntry);
      } else {
        merged.push({
          id: `_default_${crypto.createHash("md5").update(def.adTitle).digest("hex").slice(0, 8)}`,
          adTitle: def.adTitle,
          propertyId: def.propertyId,
        });
      }
    }

    for (const dbEntry of dbEquivalences) {
      if (!seenTitles.has(dbEntry.adTitle)) {
        merged.push(dbEntry);
      }
    }

    return merged;
  }

  async getByTeam(teamId: string): Promise<Equivalence[]> {
    return this.equivalenceRepository.findAllByTeam(teamId);
  }

  async getById(id: string): Promise<Equivalence | null> {
    return this.equivalenceRepository.findById(id);
  }

  async create(dto: CreateEquivalenceDTO, userId: string): Promise<Equivalence> {
    return this.equivalenceRepository.create({
      adTitle: dto.adTitle,
      propertyId: dto.propertyId,
      userId,
    });
  }

  async createForTeam(dto: CreateEquivalenceDTO, teamId: string): Promise<Equivalence> {
    return this.equivalenceRepository.create({
      adTitle: dto.adTitle,
      propertyId: dto.propertyId,
      teamId,
    });
  }

  async update(id: string, dto: UpdateEquivalenceDTO): Promise<Equivalence | null> {
    if (id.startsWith("_default_")) return null;
    return this.equivalenceRepository.update(id, dto);
  }

  async delete(id: string): Promise<boolean> {
    if (id.startsWith("_default_")) return false;
    return this.equivalenceRepository.delete(id);
  }
}
