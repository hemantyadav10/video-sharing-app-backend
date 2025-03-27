import { Router } from 'express';
import {
  getSubscribedChannels,
  fetchSubscribedChannelVideos,
  toggleSubscription,
  getUserChannelSubscribers,
} from "../controllers/subscription.controller.js"
import { verifyJWT } from "../middlewares/auth.middleware.js"

const router = Router();
router.use(verifyJWT);

router.route('/').get(getUserChannelSubscribers)

router
  .route("/c/:channelId")
  .post(toggleSubscription);

router.route("/u/:subscriberId").get(getSubscribedChannels);

router.route("/videos").get(fetchSubscribedChannelVideos)


export default router