import { Router } from 'express';
import {
    addComment,
    deleteComment,
    fetchCommentReplies,
    getVideoComments,
    pinComment,
    unpinComment,
    updateComment
} from "../controllers/comment.controller.js"
import { verifyJWT } from "../middlewares/auth.middleware.js"
import { optionalAuth } from "../middlewares/optionalAuth.middleware.js";

const router = Router();


router.route("/:videoId")
    .get(optionalAuth, getVideoComments)
    .post(verifyJWT, addComment);

router.route("/replies/:commentId").get(optionalAuth, fetchCommentReplies)

router.use(verifyJWT);

router.route("/:videoId/:parentId").post(addComment)

router.route("/c/:commentId")
    .delete(deleteComment)
    .patch(updateComment)

router.route('/:commentId/:videoId/pin')
    .patch(pinComment)

router.route('/:commentId/:videoId/unpin')
    .patch(unpinComment)

export default router