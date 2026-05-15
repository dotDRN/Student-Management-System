import { Router } from "express";
import { requireAuth as authenticate } from '../lib/auth.js';
import {
  getSkillsByStudentController,
  listSkillDefinitionsController,
  createSkillLogController,
} from '../controllers/skillController.js';

const skillRoutes = Router();

skillRoutes.use(authenticate);

skillRoutes.get("/definitions", listSkillDefinitionsController);
skillRoutes.get("/student/:studentId", getSkillsByStudentController);
skillRoutes.post("/student/:studentId", createSkillLogController);

export default skillRoutes;
