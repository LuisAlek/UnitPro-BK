export interface Equivalence {
  id?: string;
  adTitle: string;
  propertyId: string;
  userId?: string;
  teamId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type CreateEquivalenceDTO = {
  adTitle: string;
  propertyId: string;
};

export type UpdateEquivalenceDTO = {
  adTitle?: string;
  propertyId?: string;
};
