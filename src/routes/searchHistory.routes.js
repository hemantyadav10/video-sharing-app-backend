import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import {
  clearSearchHistory,
  deleteSearchItem,
  getUserSearchHistory,
  setSearchHistory
} from "../controllers/searchHistory.controller.js";

const router = Router()

router.use(verifyJWT)

router.route('/')
  .get(getUserSearchHistory)
  .post(setSearchHistory)
  .delete(clearSearchHistory)
  .patch(deleteSearchItem)

export default router