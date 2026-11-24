import api from './api';
import type { ApiEnvelope } from '../types';

function unwrap<T>(body: ApiEnvelope<T> | T): T {
  if (body && typeof body === 'object' && 'data' in body && 'success' in body) {
    return (body as ApiEnvelope<T>).data;
  }
  return body as T;
}

export interface AiPageContext {
  route?: string;
  studentId?: string;
  centerId?: string;
  programId?: string;
}

export interface AiCitation {
  sourceType: string;
  title: string;
  snippet: string;
  entityId?: string;
  studentId?: string;
  centerId?: string;
  date?: string;
  score?: number;
}

export interface AiThreadMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  toolsUsed?: string[];
  citations?: AiCitation[];
  providerMode?: string;
  context?: AiPageContext;
}

export interface AiThreadSummary {
  id: string;
  title: string;
  messageCount: number;
  lastMessagePreview: string;
  context?: AiPageContext;
  updatedAt: string;
  createdAt: string;
}

export interface AiThreadRecord {
  id: string;
  title: string;
  userId: string;
  context?: AiPageContext;
  messages: AiThreadMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface AiChatResponse {
  threadId: string;
  reply: string;
  providerMode: 'gemini' | 'deterministic-synthesizer';
  toolsUsed: string[];
  citations: AiCitation[];
  suggestedFollowUps: string[];
  memoryContextCount: number;
}

export interface AiEntityMemory {
  id: string;
  entityType: 'student' | 'center' | 'program';
  entityId: string;
  centerId: string | null;
  category: string;
  summary: string;
  tags: string[];
  createdByName: string | null;
  createdAt: string;
}

export interface AiStatusResponse {
  mode: 'gemini' | 'deterministic-synthesizer';
  model: string;
  embeddingModel: string;
  hasApiKey: boolean;
  availableTools: Array<{ name: string; label: string; description: string }>;
  memoryLayers: string[];
}

export interface Student360Briefing {
  studentId: string;
  studentName: string;
  generatedAt: string;
  providerMode: 'gemini' | 'deterministic-synthesizer';
  readinessStatus: 'thriving' | 'steady' | 'needs_support' | 'high_priority';
  executiveSummary: string;
  academicTrajectory: {
    headline: string;
    strengths: string[];
    growthAreas: string[];
    momentumNotes: string;
  };
  skillAndBehavioralSynthesis: string;
  riskSignalsAndAttendance: string;
  staffNextSteps: Array<{
    priority: 'high' | 'medium' | 'low';
    action: string;
    ownerRole: string;
    timeline: string;
  }>;
  parentNarrative: {
    english: string;
    hindi: string;
    marathi: string;
  };
  memoriesReferenced: number;
}

export interface CareerUpskillingPlaybook {
  studentId: string;
  studentName: string;
  programName: string;
  generatedAt: string;
  providerMode: 'gemini' | 'deterministic-synthesizer';
  learnerDiagnosis: {
    summary: string;
    topStrengths: string[];
    prioritySkillGaps: string[];
    academicReadinessLevel: 'foundational' | 'developing' | 'career_ready';
  };
  recommendedPathways: Array<{
    careerGoal: string;
    industry: string;
    fitScore: number;
    rationale: string;
    targetMilestones: string[];
    suggestedNotes: string;
  }>;
  staffUpskillingProcedure: {
    phase30Days: { title: string; objective: string; staffSteps: string[] };
    phase60Days: { title: string; objective: string; staffSteps: string[] };
    phase90Days: { title: string; objective: string; staffSteps: string[] };
  };
  recommendedSkillDrills: Array<{
    skillName: string;
    currentLevel: number;
    targetLevel: number;
    staffFacilitationProcedure: string;
    frequency: string;
  }>;
  memoriesReferenced: number;
}

export const getAiStatus = () =>
  api.get<ApiEnvelope<AiStatusResponse>>('/ai/status').then((r) => unwrap(r.data));

export const sendAiChatMessage = (payload: {
  message: string;
  threadId?: string;
  context?: AiPageContext;
}) =>
  api.post<ApiEnvelope<AiChatResponse>>('/ai/chat', payload).then((r) => unwrap(r.data));

export const getAiThreads = (limit = 25) =>
  api
    .get<ApiEnvelope<AiThreadSummary[]>>('/ai/threads', { params: { limit } })
    .then((r) => unwrap(r.data));

export const getAiThreadById = (threadId: string) =>
  api.get<ApiEnvelope<AiThreadRecord>>(`/ai/threads/${threadId}`).then((r) => unwrap(r.data));

export const deleteAiThread = (threadId: string) =>
  api
    .delete<ApiEnvelope<{ deleted: true; id: string }>>(`/ai/threads/${threadId}`)
    .then((r) => unwrap(r.data));

export const generateStudentAiBriefing = (studentId: string) =>
  api
    .post<ApiEnvelope<Student360Briefing>>(`/ai/students/${studentId}/briefing`, {})
    .then((r) => unwrap(r.data));

export const generateStudentCareerPlaybook = (
  studentId: string,
  payload?: { focusArea?: string; customGoal?: string },
) =>
  api
    .post<ApiEnvelope<CareerUpskillingPlaybook>>(
      `/ai/students/${studentId}/career-playbook`,
      payload ?? {},
    )
    .then((r) => unwrap(r.data));

export const getEntityAiMemories = (
  entityType: 'student' | 'center' | 'program',
  entityId: string,
) =>
  api
    .get<ApiEnvelope<AiEntityMemory[]>>(`/ai/memories/${entityType}/${entityId}`)
    .then((r) => unwrap(r.data));

export const addEntityAiMemory = (payload: {
  entityType: 'student' | 'center' | 'program';
  entityId: string;
  category?: string;
  summary: string;
  tags?: string[];
}) =>
  api.post<ApiEnvelope<AiEntityMemory>>('/ai/memories', payload).then((r) => unwrap(r.data));
