import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/multer.middleware.js";
import {
  deleteVideo,
  getAllVideos,
  getVideoById,
  publishVideo,
  togglePublishStatus,
  updateVideo
} from "../controllers/video.controller.js";
import { optionalAuth } from "../middlewares/optionalAuth.middleware.js";


const router = Router()

router.route('/')
  .get(getAllVideos)
  .post(
    verifyJWT,
    upload.fields([
      {
        name: 'video',
        maxCount: 1
      },
      {
        name: 'thumbnail',
        maxCount: 1
      }
    ]),
    publishVideo
  )


router
  .route('/:videoId')
  .get(optionalAuth, getVideoById)
  .delete(verifyJWT, deleteVideo)
  .patch(verifyJWT, upload.single("thumbnail"), updateVideo);

router.route("/toggle/publish/:videoId").patch(verifyJWT, togglePublishStatus);

export default router;