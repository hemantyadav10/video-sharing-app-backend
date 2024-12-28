import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import {
  getChannelStats,
  getChannelVideos
} from "../controllers/dashboard.controller.js";

const router = Router()

router.route('/videos').get(verifyJWT, getChannelVideos)
router.route('/stats/:channelId').get(getChannelStats)

export default router 