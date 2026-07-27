export interface User {
  id?: string;
  email: string;
  passwordHash: string;
  name: string;
  role?: "user" | "admin";
  teamIds: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

export type CreateUserDTO = {
  email: string;
  password: string;
  name: string;
};

export type LoginUserDTO = {
  email: string;
  password: string;
};

export type UserResponse = Omit<User, "passwordHash">;
