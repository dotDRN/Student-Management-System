import { Router } from "express";
import {
  register,
  registerInstance,
  checkSlug,
  login,
  refresh,
  logout,
  getMe,
  changePassword,
} from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

// Public routes
router.get("/check-slug", checkSlug);
router.post("/register-instance", registerInstance);
router.post("/register", register);
router.post("/login", login);
router.post("/refresh", refresh);
router.post("/logout", logout);

// Protected routes
router.get("/me", authenticate, getMe);
router.post("/change-password", authenticate, changePassword);

export default router;
