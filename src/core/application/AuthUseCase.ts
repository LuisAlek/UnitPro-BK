import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { IUserRepository } from "../domain/ports/IUserRepository";
import { CreateUserDTO, LoginUserDTO, UserResponse } from "../domain/entities/User";
import { env } from "../../config/env";

export class AuthUseCase {
  constructor(private userRepository: IUserRepository) {}

  async register(dto: CreateUserDTO): Promise<{ user: UserResponse; token: string }> {
    const existing = await this.userRepository.findByEmail(dto.email);
    if (existing) {
      throw new Error("Email already registered");
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.userRepository.create({
      email: dto.email,
      passwordHash,
      name: dto.name,
      teamIds: [],
    });

    const token = this.generateToken(user.id!);
    return { user: { id: user.id, email: user.email, name: user.name, teamIds: user.teamIds }, token };
  }

  async login(dto: LoginUserDTO): Promise<{ user: UserResponse; token: string }> {
    const user = await this.userRepository.findByEmail(dto.email);
    if (!user) {
      throw new Error("Invalid credentials");
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new Error("Invalid credentials");
    }

    const token = this.generateToken(user.id!);
    return { user: { id: user.id, email: user.email, name: user.name, teamIds: user.teamIds }, token };
  }

  async getUser(userId: string): Promise<UserResponse | null> {
    const user = await this.userRepository.findById(userId);
    if (!user) return null;
    return { id: user.id, email: user.email, name: user.name, teamIds: user.teamIds };
  }

  async updateProfile(userId: string, data: { name?: string; email?: string }): Promise<UserResponse> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new Error("User not found");

    if (data.email && data.email !== user.email) {
      const existing = await this.userRepository.findByEmail(data.email);
      if (existing) throw new Error("Email already in use");
    }

    const updated = await this.userRepository.update(userId, data);
    return { id: updated.id!, email: updated.email, name: updated.name, teamIds: updated.teamIds };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new Error("User not found");

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new Error("Current password is incorrect");

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.userRepository.update(userId, { passwordHash });
  }

  private generateToken(userId: string): string {
    return jwt.sign({ userId }, env.JWT_SECRET, { expiresIn: "7d" });
  }
}
