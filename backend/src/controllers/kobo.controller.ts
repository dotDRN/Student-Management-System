import { Request, Response, NextFunction } from "express";
import { syncKoboForms, syncKoboSubmissions } from "../services/kobo.service.js";
import { JwtPayload } from "../lib/auth.js";

type AuthRequest = Request & { user?: JwtPayload };

export const syncTemplatesController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = (req as AuthRequest).user;
    if (!user) throw new Error("Unauthorized");

    const result = await syncKoboForms(user.userId);
    res.json({ success: true, message: `Synced ${result.count} forms from KoboToolbox.` });
  } catch (error) {
    next(error);
  }
};

export const syncSubmissionsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = (req as AuthRequest).user;
    if (!user) throw new Error("Unauthorized");

    const { templateId, assetUid } = req.body;
    if (!templateId || !assetUid) {
      return res.status(400).json({ success: false, message: "templateId and assetUid are required" });
    }

    // Default to the user's primary center if no center is specified in the form
    const defaultCenterId = user.centerIds[0];
    if (!defaultCenterId) {
       return res.status(403).json({ success: false, message: "You must be assigned to at least one center to sync submissions." });
    }

    const result = await syncKoboSubmissions(templateId, assetUid, user.userId, defaultCenterId);
    res.json({ success: true, message: `Synced ${result.count} new submissions.` });
  } catch (error) {
    next(error);
  }
};
