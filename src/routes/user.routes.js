import { Router } from "express";
import {
  changeCurrentPassword,
  getCurrentUser,
  getUserChannelInfo,
  getWatchHistory,
  loginUser,
  logoutUser,
  refreshAccessToken,
  registerUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
  clearWatchHistory,
  searchChannels
} from "../controllers/user.controller.js";
import { upload } from '../middlewares/multer.middleware.js'
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { optionalAuth } from "../middlewares/optionalAuth.middleware.js";
import { validateFile } from "../middlewares/validateFile.middleware.js";

const router = Router();

router.route("/register").post(
  upload.fields([
    {
      name: 'avatar',
      maxCount: 1
    },
    {
      name: 'coverImage',
      maxCount: 1
    }
  ]),
  validateFile,
  registerUser
)

router.route('/login').post(loginUser)

router.route('/logout').post(logoutUser)

router.route('/refresh-token').post(refreshAccessToken)

router.route('/change-password').post(verifyJWT, changeCurrentPassword)

router.route('/current-user').get(verifyJWT, getCurrentUser)

router.route('/update-account').patch(verifyJWT, updateAccountDetails)

router.route('/avatar').patch(verifyJWT, upload.single('avatar'), validateFile, updateUserAvatar)

router.route('/cover-image').patch(verifyJWT, upload.single('coverImage'), validateFile, updateUserCoverImage)

router.route('/channel/:userId').get(optionalAuth, getUserChannelInfo)

router.route('/watch-history')
  .get(verifyJWT, getWatchHistory)
  .delete(verifyJWT, clearWatchHistory)

router.route('/search').get(optionalAuth, searchChannels)

export default router;