import { ApiError } from "../utils/apiError.js";
import fs from "fs";

export const validateFile = (req, _res, next) => {
  // Define file size limits
  const MAX_VIDEO_SIZE = 30; // MB
  const MAX_IMAGE_SIZE = 3; // MB

  const ALLOWED_MIME_TYPES = {
    video: ["video/mp4", "video/webm"],
    image: ["image/jpeg", "image/png", "image/webp"],
  };

  const { video, thumbnail, avatar, coverImage } = req.files || {};
  const singleFile = req.file || null;
  console.log("files", req.files, req.file);

  // Function to delete a file if validation fails
  const deleteFile = (file) => {
    if (file?.path) {
      try {
        fs.unlinkSync(file.path); // Remove file from the server
        console.log(`Deleted file: ${file.path}`);
      } catch (err) {
        console.error(`Error deleting file: ${file.path}`, err);
      }
    }
  };

  try {
    // Validate video
    if (video?.[0]) {
      const videoFile = video[0];

      if (!ALLOWED_MIME_TYPES.video.includes(videoFile.mimetype)) {
        deleteFile(videoFile);
        throw new ApiError(400, "Invalid video format. Allowed: MP4, WEBM.");
      }
      if (videoFile.size > MAX_VIDEO_SIZE * 1024 * 1024) {
        deleteFile(videoFile);
        throw new ApiError(400, `Video file size exceeds ${MAX_VIDEO_SIZE}MB.`);
      }
    }

    // Validate all image files individually
    [thumbnail?.[0], avatar?.[0], coverImage?.[0]].forEach((imageFile) => {
      if (imageFile) {
        if (!ALLOWED_MIME_TYPES.image.includes(imageFile.mimetype)) {
          deleteFile(imageFile);
          throw new ApiError(400, "Invalid image format. Allowed: JPEG, PNG, WEBP.");
        }
        if (imageFile.size > MAX_IMAGE_SIZE * 1024 * 1024) {
          deleteFile(imageFile);
          throw new ApiError(400, `Image file size exceeds ${MAX_IMAGE_SIZE}MB.`);
        }
      }
    });

    // Validate single file (if present)
    if (singleFile) {
      if (!ALLOWED_MIME_TYPES.image.includes(singleFile.mimetype)) {
        deleteFile(singleFile);
        throw new ApiError(400, "Invalid image format. Allowed: JPEG, PNG, WEBP.");
      }
      if (singleFile.size > MAX_IMAGE_SIZE * 1024 * 1024) {
        deleteFile(singleFile);
        throw new ApiError(400, `Image file size exceeds ${MAX_IMAGE_SIZE}MB.`);
      }
    }

    next(); // Proceed to the next middleware if validation passes
  } catch (error) {
    next(error); // Pass the error to the error-handling middleware
  }
};
