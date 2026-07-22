import { Equivalence } from "../entities/Equivalence";

export interface IEquivalenceRepository {
  findAll(): Promise<Equivalence[]>;
  findAllByUser(userId: string): Promise<Equivalence[]>;
  findAllByTeam(teamId: string): Promise<Equivalence[]>;
  findById(id: string): Promise<Equivalence | null>;
  create(data: Omit<Equivalence, "id" | "createdAt" | "updatedAt">): Promise<Equivalence>;
  update(id: string, data: Partial<Equivalence>): Promise<Equivalence | null>;
  delete(id: string): Promise<boolean>;
  deleteAllByUser(userId: string): Promise<number>;
  deleteAllByTeam(teamId: string): Promise<number>;
}
