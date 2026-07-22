import { IEquivalenceRepository } from "../domain/ports/IEquivalenceRepository";
import { CreateEquivalenceDTO, UpdateEquivalenceDTO, Equivalence } from "../domain/entities/Equivalence";
import { defaultEquivalences } from "../../config/defaultEquivalences";

export class ManageEquivalencesUseCase {
  constructor(private equivalenceRepository: IEquivalenceRepository) {}

  async getAll(userId?: string): Promise<Equivalence[]> {
    if (userId) return this.equivalenceRepository.findAllByUser(userId);
    return this.equivalenceRepository.findAll();
  }

  async getAllPublic(): Promise<Equivalence[]> {
    return this.equivalenceRepository.findAll();
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
    return this.equivalenceRepository.update(id, dto);
  }

  async delete(id: string): Promise<boolean> {
    return this.equivalenceRepository.delete(id);
  }

  async seed(userId: string): Promise<Equivalence[]> {
    const existing = await this.equivalenceRepository.findAllByUser(userId);
    const existingTitles = new Set(existing.map((e) => e.adTitle));

    const created: Equivalence[] = [];
    for (const eq of defaultEquivalences) {
      if (!existingTitles.has(eq.adTitle)) {
        const createdEq = await this.equivalenceRepository.create({
          adTitle: eq.adTitle,
          propertyId: eq.propertyId,
          userId,
        });
        created.push(createdEq);
      }
    }
    return created;
  }

  async seedForTeam(teamId: string): Promise<Equivalence[]> {
    const existing = await this.equivalenceRepository.findAllByTeam(teamId);
    const existingTitles = new Set(existing.map((e) => e.adTitle));

    const created: Equivalence[] = [];
    for (const eq of defaultEquivalences) {
      if (!existingTitles.has(eq.adTitle)) {
        const createdEq = await this.equivalenceRepository.create({
          adTitle: eq.adTitle,
          propertyId: eq.propertyId,
          teamId,
        });
        created.push(createdEq);
      }
    }
    return created;
  }

  async reseed(userId: string): Promise<Equivalence[]> {
    await this.equivalenceRepository.deleteAllByUser(userId);
    return this.seed(userId);
  }
}
