import { Comment } from '../models/comment.model.js';
import { ApiError } from '../utils/apiError.js'
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import mongoose, { isValidObjectId } from 'mongoose'
import { Video } from '../models/video.model.js';
import { Like } from '../models/like.model.js';


// Add a comment to a video
const addComment = asyncHandler(async (req, res) => {
  const { content } = req.body
  const { videoId, parentId } = req.params

  // check if content is there and videoId is a valid id
  if (!content?.trim()) {
    throw new ApiError(400, "Content is required");
  }
  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid video id")
  }

  //check for video existence
  const video = await Video.findById(videoId).select("_id");
  if (!video) {
    throw new ApiError(404, "Video does not exist");
  }

  // If parent id is provided, check if the parent comment exists
  if (parentId) {
    if (!isValidObjectId(parentId)) {
      throw new ApiError(400, 'Invalid parent comment id')
    }
    const parentComment = await Comment.findById(parentId)
    if (!parentComment) {
      throw new ApiError(404, "Parent comment doesnot exists")
    }
  }

  //create comment or a reply
  const comment = await Comment.create({
    content: content.trim(),
    video: videoId,
    owner: req.user?._id,
    parentId: parentId || null
  })

  return res
    .status(200)
    .json(new ApiResponse(200, comment, 'Comment added successfully'))
})

// Update a comment
const updateComment = asyncHandler(async (req, res) => {
  const { newComment } = req.body
  const { commentId } = req.params

  if (!newComment?.trim()) {
    throw new ApiError(400, "Content is required")
  }

  if (!isValidObjectId(commentId)) {
    throw new ApiError(400, "Invalid comment id")
  }

  const updatedComment = await Comment.findOneAndUpdate(
    {
      _id: commentId,
      owner: req.user._id
    },
    { content: newComment.trim(), isEdited: true },
    { new: true, validateBeforeSave: false }
  )

  if (!updatedComment) {
    throw new ApiError(500, "You are not authorized to update this comment or the comment does not exist")
  }

  return res
    .status(200)
    .json(new ApiResponse(200, updatedComment, 'Comment updated successfully'))

})

/**
 * Deletes a comment by its ID, ensuring the logged-in user is the owner.
 * 
 * - Validates the comment ID format.
 * - Checks ownership to prevent unauthorized deletion.
 * - If the comment has no likes or replies, deletes it directly.
 * - If the comment has likes or replies:
 *    - Deletes likes on the main comment and replies.
 *    - Deletes all replies.
 *    - Deletes the main comment.
 *    - All deletions are wrapped in a MongoDB transaction for atomicity.
 * 
 * Responds with a success message upon complete deletion.
 * Rolls back all changes and returns an error if any step fails.
 */
const deleteComment = asyncHandler(async (req, res) => {
  const { commentId } = req.params;
  const userId = req.user?._id

  // Validate the comment ID
  if (!isValidObjectId(commentId)) {
    throw new ApiError(400, "Invalid comment id");
  }

  // Check if the logged-in user is the owner of the comment
  const isOwner = await Comment.exists({
    owner: userId,
    _id: commentId
  });

  if (!isOwner) {
    throw new ApiError(403, 'Comment not found or you are not authorized to delete this comment.');
  }

  // Check if the comment has any likes or replies
  const [hasLikes, hasReplies] = await Promise.all([
    Like.exists({ comment: commentId }),
    Comment.exists({ parentId: commentId }),
  ]);

  // If no likes or replies exist, delete the comment directly (no need for transaction)
  if (!hasReplies && !hasLikes) {
    await Comment.findByIdAndDelete(commentId);

    return res
      .status(200)
      .json(new ApiResponse(200, {}, 'Comment deleted successfully'));
  }

  // Start a session for transactional delete
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    // Delete likes on the main comment
    await Like.deleteMany({ comment: commentId }).session(session);

    // Find replies to this comment
    const replies = await Comment.find({ parentId: commentId })
      .select("_id")
      .session(session);
    const repliesId = replies.map(r => r._id);

    // If replies exist, delete their likes and the replies themselves
    if (replies?.length > 0) {
      await Promise.all([
        Comment.deleteMany({ parentId: commentId }).session(session),
        Like.deleteMany({ comment: { $in: repliesId } }).session(session)
      ]);
    }

    // Finally, delete the main comment
    await Comment.findByIdAndDelete(commentId).session(session);

    // Commit the transaction
    await session.commitTransaction();

    return res
      .status(200)
      .json(new ApiResponse(200, {}, "Comment and related data deleted successfully"))
  } catch (error) {
    await session.abortTransaction();
    console.error("Transaction failed while deleting comment and related data:", error);
    throw new ApiError(500, "Failed to delete comment and related data.");
  } finally {
    session.endSession();
  }
});

// Fetch all comments for a video with pagination and sorting
const getVideoComments = asyncHandler(async (req, res) => {
  const { videoId } = req.params
  const { page = 1, limit = 10, sortBy = 'newest' } = req.query

  if (!(isValidObjectId(videoId))) {
    throw new ApiError(400, "Invalid video id")
  }

  const comments = Comment.aggregate([
    {
      $match: {
        video: new mongoose.Types.ObjectId(videoId),
        parentId: null
      }
    },
    {
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "owner",
        pipeline: ([
          {
            $project: {
              username: 1,
              fullName: 1,
              avatar: 1
            }
          }
        ])
      }
    },
    {
      $lookup: {
        from: "likes",
        localField: "_id",
        foreignField: "comment",
        as: "likes",
      }
    },
    {
      $lookup: {
        from: "comments",
        localField: "_id",
        foreignField: "parentId",
        as: "replies"
      }
    },
    {
      $addFields: {
        owner: {
          $first: "$owner"
        },
        likesCount: {
          $size: "$likes"
        },
        isLiked: {
          $cond: {
            if: { $in: [req.user?._id, "$likes.likedBy"] },
            then: true,
            else: false
          }
        },
        repliesCount: {
          $size: "$replies"
        },
        effectivePinned: { $ifNull: ["$isPinned", false] }
      }
    },
    {
      $project: {
        likes: 0,
        replies: 0,
        __v: 0
      }
    }
  ])

  const limitedComments = await Comment.aggregatePaginate(comments, {
    limit: Number(limit),
    page: Number(page),
    sort: {
      "effectivePinned": -1,
      "createdAt": sortBy === 'newest' ? -1 : 1
    }
  })

  const totalCommentsCount = await Comment.countDocuments({ video: videoId });

  return res
    .status(200)
    .json(new ApiResponse(200, {
      comments: limitedComments,
      totalCommentsCount
    }, "Video comments fetched successfully"))

})

// Fetch all comment replies 
const fetchCommentReplies = asyncHandler(async (req, res) => {
  const { commentId } = req.params
  const { limit = 5, page = 1 } = req.query

  if (!isValidObjectId(commentId)) {
    throw new ApiError(400, "Invalid comment Id");
  }

  const pipeline = Comment.aggregate([
    {
      $match: {
        parentId: new mongoose.Types.ObjectId(commentId)
      }
    },
    {
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "owner",
        pipeline: ([
          {
            $project: {
              username: 1,
              fullName: 1,
              avatar: 1
            }
          }
        ])
      }
    },
    {
      $lookup: {
        from: "likes",
        localField: "_id",
        foreignField: "comment",
        as: "likes",
      }
    },
    {
      $addFields: {
        owner: {
          $first: "$owner"
        },
        likesCount: {
          $size: "$likes"
        },
        isLiked: {
          $cond: {
            if: { $in: [req.user?._id, "$likes.likedBy"] },
            then: true,
            else: false
          }
        },
      }
    },
    {
      $project: {
        content: 1,
        owner: 1,
        createdAt: 1,
        updatedAt: 1,
        likesCount: 1,
        isLiked: 1,
      }
    }
  ])

  const replies = await Comment.aggregatePaginate(pipeline, {
    limit: Number(limit),
    page: Number(page),
    sort: { "createdAt": 1 }
  })

  return res
    .status(200)
    .json(new ApiResponse(200, replies, "Replies fetched successfully"))
})

/**
 * Pin a top-level comment on a video.
 * Ensures only one pinned comment per video and only by the video owner.
 */
const pinComment = asyncHandler(async (req, res) => {
  const { commentId, videoId } = req.params;
  const userId = req.user?._id;

  // Fetch comment and video in parallel
  const [comment, video] = await Promise.all([
    Comment.findById(commentId),
    Video.findById(videoId)
  ]);

  if (!comment) {
    throw new ApiError(404, 'Comment not found.');
  }

  if (!video) {
    throw new ApiError(404, 'Video associated with the comment not found')
  }

  // Ensure the comment actually belongs to the provided video
  if (!comment.video.equals(video._id)) {
    throw new ApiError(400, 'Comment does not belong to the specified video.');
  }

  // Exit early if the comment is already pinned
  if (comment.isPinned) {
    throw new ApiError(400, 'Comment is already pinned.');
  }

  // Prevent pinning replies; only top-level comments are allowed
  if (comment.parentId) {
    throw new ApiError(400, "Cannot pin replies. Only top-level comments can be pinned.");
  }

  // Only the video owner is allowed to pin comments
  if (!video.owner.equals(userId)) {
    throw new ApiError(403, 'Unauthorized request');
  }

  const pinnedComment = await Comment.exists({
    video: videoId,
    isPinned: true,
    _id: { $ne: commentId }
  });

  // If no other pinned comment exists, directly pin this one
  if (!pinnedComment) {
    const updatedComment = await Comment.findByIdAndUpdate(
      commentId,
      { $set: { isPinned: true } },
      { new: true }
    ).populate({
      path: 'owner',
      select: "username fullName avatar"
    });

    return res
      .status(200)
      .json(new ApiResponse(200, updatedComment, 'Comment pinned successfully.'))
  }

  // If another is already pinned, unpin it atomically using a transaction
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    // Unpin any previously pinned comment on the same video, then pin the new one
    const [_, updated] = await Promise.all([
      Comment.findOneAndUpdate(
        {
          video: videoId,
          isPinned: true,
          _id: { $ne: commentId }
        },
        { $set: { isPinned: false } }
      ).session(session),

      Comment.findByIdAndUpdate(
        commentId,
        { $set: { isPinned: true } },
        { new: true, session }
      )
    ]);

    await session.commitTransaction();

    // Do population *after* transaction
    const updatedComment = await updated.populate({
      path: 'owner',
      select: 'username fullName avatar'
    });

    return res
      .status(200)
      .json(new ApiResponse(200, updatedComment, 'Comment pinned successfully.'))
  } catch (error) {
    await session.abortTransaction();
    console.error("Transaction failed while pinning comment.");

    throw new ApiError(500, 'Failed to pin the comment.')
  } finally {
    session.endSession();
  }
});

/**
 * Unpins a comment from a video.
 * Only the video owner can unpin a top-level pinned comment.
 */
const unpinComment = asyncHandler(async (req, res) => {
  const { commentId, videoId } = req.params;
  const userId = req.user?._id;

  // Fetch comment and video in parallel
  const [comment, video] = await Promise.all([
    Comment.findById(commentId),
    Video.findById(videoId)
  ]);

  if (!comment) {
    throw new ApiError(404, 'Comment not found.');
  }

  if (!video) {
    throw new ApiError(404, 'Video associated with the comment not found')
  }

  // Ensure the comment actually belongs to the provided video
  if (!comment.video.equals(video._id)) {
    throw new ApiError(400, 'Comment does not belong to the specified video.');
  }

  // Exit early if the comment is already unpinned
  if (!comment.isPinned) {
    throw new ApiError(400, 'Comment is already unpinned.');
  }

  if (comment.parentId) {
    throw new ApiError(400, "Cannot unpin replies. Only top-level comments can be pinned or unpinned.");
  }

  // Only the video owner is allowed to pin comments
  if (!video.owner.equals(userId)) {
    throw new ApiError(403, 'Unauthorized request');
  }

  const updatedComment = await Comment.findByIdAndUpdate(
    commentId,
    { $set: { isPinned: false } },
    { new: true }
  ).populate({
    path: 'owner',
    select: "username fullName avatar"
  });

  return res
    .status(200)
    .json(new ApiResponse(200, updatedComment, 'Comment unpinned successfully.'))
})

export {
  addComment,
  deleteComment,
  updateComment,
  getVideoComments,
  fetchCommentReplies,
  pinComment,
  unpinComment
}