import { Router, Request, Response } from "express";
import { TeamUseCase } from "../../../../core/application/TeamUseCase";
import { MongooseTeamRepository } from "../../persistence/MongooseTeamRepository";
import { MongooseUserRepository } from "../../persistence/MongooseUserRepository";
import { AuthRequest, authMiddleware } from "../middleware/auth";

const router = Router();
const teamRepo = new MongooseTeamRepository();
const userRepo = new MongooseUserRepository();
const teamUseCase = new TeamUseCase(teamRepo, userRepo);

router.use(authMiddleware);

router.post("/", async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { name } = req.body;
    if (!name) { res.status(400).json({ error: "Team name is required" }); return; }
    const team = await teamUseCase.create({ name }, authReq.userId!);
    res.status(201).json(team);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ error: message });
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const teams = await teamUseCase.getMyTeams(authReq.userId!);
    res.json(teams);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const team = await teamUseCase.getById(id);
    if (!team) { res.status(404).json({ error: "Team not found" }); return; }
    res.json(team);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.put("/:id", async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const id = req.params.id as string;
    const { name, memberIds, isPublic } = req.body;
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (memberIds !== undefined) updateData.memberIds = memberIds;
    if (isPublic !== undefined) updateData.isPublic = isPublic;
    const team = await teamUseCase.update(id, updateData as Partial<import("../../../../core/domain/entities/Team").Team>, authReq.userId!);
    if (!team) { res.status(404).json({ error: "Team not found" }); return; }
    res.json(team);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ error: message });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const id = req.params.id as string;
    await teamUseCase.delete(id, authReq.userId!);
    res.status(204).send();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ error: message });
  }
});

router.post("/join-by-code", async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { code } = req.body;
    if (!code) { res.status(400).json({ error: "Invite code is required" }); return; }
    const team = await teamUseCase.joinByCode(code, authReq.userId!);
    res.json(team);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ error: message });
  }
});

router.get("/public/list", async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const teams = await teamUseCase.getPublicTeams(authReq.userId!);
    res.json(teams);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.post("/:id/request-join", async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const id = req.params.id as string;
    const team = await teamUseCase.requestJoin(id, authReq.userId!);
    res.json(team);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ error: message });
  }
});

router.get("/:id/requests", async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const id = req.params.id as string;
    const requests = await teamUseCase.getJoinRequests(id, authReq.userId!);
    res.json(requests);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ error: message });
  }
});

router.post("/:id/approve-request/:userId", async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const id = req.params.id as string;
    const targetUserId = req.params.userId as string;
    const team = await teamUseCase.approveRequest(id, targetUserId, authReq.userId!);
    res.json(team);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ error: message });
  }
});

router.post("/:id/reject-request/:userId", async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const id = req.params.id as string;
    const targetUserId = req.params.userId as string;
    const team = await teamUseCase.rejectRequest(id, targetUserId, authReq.userId!);
    res.json(team);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ error: message });
  }
});

export default router;
