import { Router } from 'express';
import {
  createTweet,
  deleteTweet,
  getUserTweets,
  updateTweet,
} from "../controllers/tweet.controller.js"
import { verifyJWT } from "../middlewares/auth.middleware.js"
import { optionalAuth } from "../middlewares/optionalAuth.middleware.js";


const router = Router();

router.route("/user/:userId").get(optionalAuth, getUserTweets);

router.use(verifyJWT);

router.route("/").post(createTweet)
router.route("/:tweetId").patch(updateTweet).delete(deleteTweet)

export default router