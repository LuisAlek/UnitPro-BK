import { Router, Request, Response } from "express";
import { DownloadHistoryUseCase } from "../../../../core/application/DownloadHistoryUseCase";
import { MongooseDownloadRepository } from "../../persistence/MongooseDownloadRepository";
import { AuthRequest, authMiddleware } from "../middleware/auth";

const router = Router();
const downloadRepo = new MongooseDownloadRepository();
const downloadHistory = new DownloadHistoryUseCase(downloadRepo);

router.use(authMiddleware);

router.get("/", async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const downloads = await downloadHistory.getAll(authReq.userId!);
    res.json(downloads);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { filename, rowCount } = req.body;
    if (!filename || rowCount === undefined) {
      res.status(400).json({ error: "filename and rowCount are required" });
      return;
    }
    const download = await downloadHistory.create({ filename, rowCount }, authReq.userId!);
    res.status(201).json(download);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ error: message });
  }
});

export default router;
