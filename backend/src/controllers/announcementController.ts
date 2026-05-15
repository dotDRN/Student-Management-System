import { Request, Response, NextFunction } from "express";
import * as announcementService from "../services/announcement.service.js";

export async function listAnnouncements(req: Request, res: Response, next: NextFunction) {
  try {
    const { role, centerIds } = req.user!;
    const { programId, cursor } = req.query;
    const announcements = await announcementService.listAnnouncements(
      { role, allowedCenterIds: centerIds, programId: programId as string },
      cursor as string
    );
    res.json(announcements);
  } catch (err) {
    next(err);
  }
}

export async function createAnnouncement(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId, role, centerIds } = req.user!;
    const announcement = await announcementService.createAnnouncement(req.body, {
      userId,
      role,
      allowedCenterIds: centerIds,
    });
    res.status(201).json(announcement);
  } catch (err) {
    next(err);
  }
}

export async function updateAnnouncement(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId, role, centerIds } = req.user!;
    const announcement = await announcementService.updateAnnouncement(req.params.id as string, req.body, {
      userId,
      role,
      allowedCenterIds: centerIds,
    });
    res.json(announcement);
  } catch (err) {
    next(err);
  }
}

export async function deleteAnnouncement(req: Request, res: Response, next: NextFunction) {
  try {
    const { role, centerIds } = req.user!;
    await announcementService.deleteAnnouncement(req.params.id as string, {
      role,
      allowedCenterIds: centerIds,
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
