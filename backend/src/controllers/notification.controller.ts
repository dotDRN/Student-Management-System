import { Request, Response, NextFunction } from "express";

import notificationService from "../services/notifications.service.js";

interface NotificationParams {
    notificationRecipientId: string;
}

class NotificationController {
    async getNotifications(
        req: Request,
        res: Response,
        next: NextFunction,
    ) {
        try {
            const userId = req.user!.userId;

            const page = Number(req.query.page) || 1;
            const limit = Number(req.query.limit) || 20;
            const unreadOnly = req.query.unreadOnly === "true";

            const notifications =
                await notificationService.getUserNotifications(
                    userId,
                    page,
                    limit,
                    unreadOnly,
                );

            res.status(200).json(notifications);
        } catch (error) {
            next(error);
        }
    }

    async getUnreadCount(
        req: Request,
        res: Response,
        next: NextFunction,
    ) {
        try {
            const count = await notificationService.getUnreadCount(
                req.user!.userId,
            );

            res.status(200).json({
                unreadCount: count,
            });
        } catch (error) {
            next(error);
        }
    }

    async markAsRead(
        req: Request<NotificationParams>,
        res: Response,
        next: NextFunction,
    ) {
        try {
            const notification = await notificationService.markAsRead(
                req.params.notificationRecipientId,
                req.user!.userId,
            );

            res.status(200).json(notification);
        } catch (error) {
            next(error);
        }
    }

    async markAllAsRead(
        req: Request,
        res: Response,
        next: NextFunction,
    ) {
        try {
            const result = await notificationService.markAllAsRead(
                req.user!.userId,
            );

            res.status(200).json(result);
        } catch (error) {
            next(error);
        }
    }

    async archiveNotification(
        req: Request<NotificationParams>,
        res: Response,
        next: NextFunction,
    ) {
        try {
            const result =
                await notificationService.archiveNotification(
                    req.params.notificationRecipientId,
                    req.user!.userId,
                );

            res.status(200).json(result);
        } catch (error) {
            next(error);
        }
    }
}

export default new NotificationController();