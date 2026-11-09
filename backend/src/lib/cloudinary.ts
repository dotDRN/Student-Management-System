import { v2 as cloudinary, UploadApiResponse } from "cloudinary";
import { BadRequestError } from "./errors.js";

function configureCloudinary() {
  const cloudinaryUrl = process.env.CLOUDINARY_URL;
  let cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  let apiKey = process.env.CLOUDINARY_API_KEY;
  let apiSecret =
    process.env.CLOUDINARY_API_SECRET || process.env.CLOUDINARY_API_SECCRET;

  if (cloudinaryUrl && cloudinaryUrl.startsWith("cloudinary://")) {
    try {
      const parsed = new URL(cloudinaryUrl);
      cloudName = cloudName || parsed.hostname;
      apiKey = apiKey || decodeURIComponent(parsed.username);
      apiSecret = apiSecret || decodeURIComponent(parsed.password);
    } catch {
      // Fallback to individual env vars
    }
  }

  if (cloudName && apiKey && apiSecret) {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
  } else {
    cloudinary.config({ secure: true });
  }
}

configureCloudinary();

export interface CloudinaryUploadResult {
  id: string;
  url: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  resourceType: string;
}

export async function uploadBufferToCloudinary(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  fileSize: number,
): Promise<CloudinaryUploadResult> {
  if (!buffer || buffer.length === 0) {
    throw new BadRequestError("Uploaded file is empty.");
  }

  // Re-ensure configuration in case dotenv was loaded after module import
  configureCloudinary();

  const sanitizedBaseName = originalName
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 60);

  return new Promise<CloudinaryUploadResult>((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "sparsha/chat_attachments",
        resource_type: "auto",
        public_id: `${sanitizedBaseName || "attachment"}_${Date.now()}`,
        use_filename: true,
        unique_filename: true,
      },
      (error, result?: UploadApiResponse) => {
        if (error || !result) {
          return reject(
            new Error(error?.message || "Cloudinary upload failed."),
          );
        }

        resolve({
          id: result.public_id,
          url: result.secure_url,
          fileName: originalName,
          mimeType: mimeType || "application/octet-stream",
          fileSize: fileSize || result.bytes || buffer.length,
          resourceType: result.resource_type,
        });
      },
    );

    uploadStream.end(buffer);
  });
}

export default cloudinary;
