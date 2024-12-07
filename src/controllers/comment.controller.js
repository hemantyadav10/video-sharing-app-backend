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
  const { videoId } = req.params

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

  //create comment if video exists
  const comment = await Comment.create({
    content: content.trim(),
    video: videoId,
    owner: req.user?._id
  })

  if (!comment) {
    throw new ApiError(500, 'Failed to add comment')
  }

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
    { content: newComment.trim() },
    { new: true, validateBeforeSave: false }
  )

  if (!updatedComment) {
    throw new ApiError(500, "You are not authorized to update this comment or the comment does not exist")
  }

  return res
    .status(200)
    .json(new ApiResponse(200, updatedComment, 'Comment updated successfully'))

})

// Delete a comment by its ID
const deleteComment = asyncHandler(async (req, res) => {
  const { commentId } = req.params;

  if (!isValidObjectId(commentId)) {
    throw new ApiError(400, "Invalid comment id")
  }

  const deletedComment = await Comment.findOneAndDelete({
    _id: commentId,
    owner: req.user._id,
  });

  if (!deletedComment) {
    throw new ApiError(404, 'Comment not found or unauthorized');
  }

  // Delete all likes associated with the comment
  await Like.deleteMany({ comment: commentId });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Comment Deleted successfully"))
})

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
        video: new mongoose.Types.ObjectId(videoId)
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
        }
      }
    },
    {
      $project: {
        content: 1,
        owner: 1,
        createdAt: 1,
        updatedAt: 1,
        likesCount: 1,
        isLiked: 1
      }
    }
  ])

  const limitedComments = await Comment.aggregatePaginate(comments, {
    limit: Number(limit),
    page: Number(page),
    sort: { "createdAt": sortBy === 'newest' ? -1 : 1 }
  })

  return res
    .status(200)
    .json(new ApiResponse(200, limitedComments, "Video comments fetched successfully"))

})

export {
  addComment,
  deleteComment,
  updateComment,
  getVideoComments
}