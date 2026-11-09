import { Router } from "express";
import multer from "multer";
import {
    uploadStandaloneAttachment,
    uploadAttachment,
    deleteAttachment
} from "../controllers/attachment.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024 // 50 MB max file size
    }
});

router.use(authenticate);

// Multipart upload to Cloudinary (used by Composer before/during sending a message)
router.post("/", upload.single("file"), uploadStandaloneAttachment);

// Attach to an existing message (supports both multipart 'file' and JSON body)
router.post("/:messageId", upload.single("file"), uploadAttachment);
router.delete("/:attachmentId", deleteAttachment);

export default router;
