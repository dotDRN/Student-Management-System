import axios from "axios";
import prisma from "../lib/prisma.js";

const KOBO_API_URL = process.env.KOBO_API_URL || "https://kf.kobotoolbox.org";
const KOBO_API_TOKEN = process.env.KOBO_API_TOKEN || "mock_token_for_dev";

const koboClient = axios.create({
  baseURL: KOBO_API_URL,
  headers: {
    Authorization: `Token ${KOBO_API_TOKEN}`,
  },
});

/**
 * Syncs all forms (assets) from KoboToolbox into our FormTemplate table.
 * @param userId ID of the user triggering the sync (assigned as creator)
 */
export async function syncKoboForms(userId: string) {
  try {
    const res = await koboClient.get("/api/v2/assets/");
    const assets = res.data.results;
    let syncedCount = 0;

    for (const asset of assets) {
      if (asset.asset_type !== "survey") continue;

      // Extract form fields if available in content
      const schema = { fields: [] };
      if (asset.content && asset.content.survey) {
        schema.fields = asset.content.survey.map((q: any) => ({
          name: q.$autoname || q.name,
          label: q.label ? (typeof q.label === 'string' ? q.label : q.label[0] || "Unnamed") : q.name,
          type: q.type,
          required: q.required === "true",
        }));
      }

      await prisma.formTemplate.upsert({
        where: { externalId: asset.uid },
        update: {
          name: asset.name,
          description: asset.settings?.description || "Synced from KoboToolbox",
          schema: schema,
        },
        create: {
          name: asset.name,
          description: asset.settings?.description || "Synced from KoboToolbox",
          formType: "kobo_survey",
          targetEntity: "general", // Can be overridden later in UI
          schema: schema,
          createdBy: userId,
          externalSource: "kobo",
          externalId: asset.uid,
          isPublished: true,
        },
      });
      syncedCount++;
    }
    return { success: true, count: syncedCount };
  } catch (error: any) {
    console.error("Failed to sync Kobo forms:", error?.response?.data || error.message);
    throw new Error("Failed to communicate with KoboToolbox API");
  }
}

/**
 * Syncs all submissions for a specific Kobo form into our FormSubmission table.
 * @param templateId Our internal FormTemplate UUID
 * @param assetUid The Kobo asset UID
 * @param userId ID of the user triggering the sync
 * @param defaultCenterId Fallback center if none found in submission
 */
export async function syncKoboSubmissions(
  templateId: string,
  assetUid: string,
  userId: string,
  defaultCenterId: string
) {
  try {
    const res = await koboClient.get(`/api/v2/assets/${assetUid}/data/`);
    const submissions = res.data.results;
    let syncedCount = 0;

    for (const sub of submissions) {
      const koboId = String(sub._id);

      // Check if we already have it
      const existing = await prisma.formSubmission.findFirst({
        where: { koboSubmissionId: koboId },
      });

      if (existing) continue;

      // Attempt to extract relations from payload if ground staff typed them in
      const studentId = sub.student_id || sub.studentId || null;
      const centerId = sub.center_id || sub.centerId || defaultCenterId;

      await prisma.formSubmission.create({
        data: {
          templateId,
          centerId,
          studentId: studentId && studentId.length === 36 ? studentId : null, // validate simple uuid length
          submittedBy: userId,
          submittedAt: sub._submission_time ? new Date(sub._submission_time) : new Date(),
          data: sub,
          koboSubmissionId: koboId,
        },
      });
      syncedCount++;
    }

    return { success: true, count: syncedCount };
  } catch (error: any) {
    console.error("Failed to sync Kobo submissions:", error?.response?.data || error.message);
    throw new Error("Failed to fetch submissions from KoboToolbox");
  }
}