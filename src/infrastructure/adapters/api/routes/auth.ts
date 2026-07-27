import { Router, Request, Response } from "express";
import { AuthUseCase } from "../../../../core/application/AuthUseCase";
import { MongooseUserRepository } from "../../persistence/MongooseUserRepository";
import { AuthRequest, authMiddleware } from "../middleware/auth";
import { env } from "../../../../config/env";

const router = Router();
const userRepo = new MongooseUserRepository();
const authUseCase = new AuthUseCase(userRepo);

router.post("/setup-admin", async (req: Request, res: Response) => {
  try {
    const { email, password, name, adminKey } = req.body;
    if (!email || !password || !name || !adminKey) {
      res.status(400).json({ error: "email, password, name and adminKey are required" });
      return;
    }
    if (adminKey !== env.ADMIN_SECRET_KEY) {
      res.status(403).json({ error: "Invalid admin key" });
      return;
    }
    const existing = await userRepo.findByEmail(email);
    if (existing) {
      res.status(400).json({ error: "Email already registered" });
      return;
    }
    const adminExists = await userRepo.findAdmin();
    if (adminExists) {
      res.status(400).json({ error: "An admin already exists" });
      return;
    }
    const result = await authUseCase.register({ email, password, name });
    await userRepo.update(result.user.id!, { role: "admin" });
    res.status(201).json({ message: "Admin user created successfully" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ error: message });
  }
});

router.post("/register", async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      res.status(400).json({ error: "Email, password and name are required" });
      return;
    }
    const result = await authUseCase.register({ email, password, name });
    res.status(201).json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ error: message });
  }
});

router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }
    const result = await authUseCase.login({ email, password });
    res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(401).json({ error: message });
  }
});

router.get("/me", authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const user = await authUseCase.getUser(authReq.userId!);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(user);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.put("/profile", authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { name, email } = req.body;
    const user = await authUseCase.updateProfile(authReq.userId!, { name, email });
    res.json(user);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ error: message });
  }
});

router.put("/password", authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: "currentPassword and newPassword are required" });
      return;
    }
    await authUseCase.changePassword(authReq.userId!, currentPassword, newPassword);
    res.json({ message: "Password updated successfully" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ error: message });
  }
});

export default router;
