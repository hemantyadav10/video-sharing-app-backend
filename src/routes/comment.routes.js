import { Router } from 'express';
import {
    addComment,
    deleteComment,
    getVideoComments,
    updateComment
} from "../controllers/comment.controller.js"
import { verifyJWT } from "../middlewares/auth.middleware.js"
import { optionalAuth } from "../middlewares/optionalAuth.middleware.js";

const router = Router();


router.route("/:videoId")
.get(optionalAuth, getVideoComments)
.post(verifyJWT, addComment);

router.use(verifyJWT);

router.route("/c/:commentId")
    .delete(deleteComment)
    .patch(updateComment)
export default router