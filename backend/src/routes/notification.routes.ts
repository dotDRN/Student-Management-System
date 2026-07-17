import { Router } from "express";

import notificationController from "../controllers/notification.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

router.use(authenticate);

router.get(
    "/",
    notificationController.getNotifications.bind(notificationController),
);

router.get(
    "/unread-count",
    notificationController.getUnreadCount.bind(notificationController),
);

router.patch(
    "/:notificationRecipientId/read",
    notificationController.markAsRead.bind(notificationController),
);

router.patch(
    "/read-all",
    notificationController.markAllAsRead.bind(notificationController),
);

router.patch(
    "/:notificationRecipientId/archive",
    notificationController.archiveNotification.bind(notificationController),
);

export default router;