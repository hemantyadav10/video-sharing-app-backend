import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/multer.middleware.js";
import { deleteVideo, getVideoById, publishVideo, updateVideo } from "../controllers/video.controller.js";

const router = Router()

router.use(verifyJWT);


router.route('/publish').post(
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
  .get(getVideoById)
  .delete(deleteVideo)
  .patch(upload.single("thumbnail"), updateVideo);

export default router;