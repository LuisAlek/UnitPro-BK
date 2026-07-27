import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../../../../config/env";
import { UserModel } from "../../persistence/models/UserModel";

export interface AuthRequest extends Request {
  userId?: string;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "No token provided" });
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as { userId: string };
    req.userId = decoded.userId;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

export async function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  if (!req.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const user = await UserModel.findById(req.userId).select("role");
  if (!user || user.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}
