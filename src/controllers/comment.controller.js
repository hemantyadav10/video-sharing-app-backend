import { Comment } from '../models/comment.model.js';
import { ApiError } from '../utils/apiError.js'
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import mongoose, { isValidObjectId } from 'mongoose'
import { Video } from '../models/video.model.js';

const addComment = asyncHandler(async (req, res) => {
  const { content } = req.body

  if (!content?.trim()) {
    throw new ApiError(400, "Content is required");
  }

  const { videoId } = req.params

  if (!videoId) {
    throw new ApiError(400, "Video id is missing")
  }
  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid video id")
  }

  const video = await Video.findById(videoId);
  if (!video) {
    throw new ApiError(404, "Video does not exist");
  }

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

const updateComment = asyncHandler(async (req, res) => {
  const { newComment } = req.body
  const { commentId } = req.params

  if (!newComment?.trim()) {
    throw new ApiError(400, "Content is required")
  }

  if (!commentId) {
    throw new ApiError(400, "comment id is required")
  }

  if (!isValidObjectId(commentId)) {
    throw new ApiError(400, "Invalid comment id")
  }

  const comment = await Comment.findById(commentId)

  if (!comment) {
    throw new ApiError(404, 'Comment not found')
  }

  if (!(comment.owner.equals(req.user?._id))) {
    throw new ApiError(403, "You are not authorized to update comment")
  }

  comment.content = newComment.trim();

  const updatedComment = await comment.save({ validateBeforeSave: false })


  if (!updatedComment) {
    throw new ApiError(500, "Failed to update comment")
  }

  return res
    .status(200)
    .json(new ApiResponse(200, comment, 'Comment updated successfully'))

})

const deleteComment = asyncHandler(async (req, res) => {
  const { commentId } = req.params;
  if (!commentId) {
    throw new ApiError(400, "comment id is missing")
  }

  if (!isValidObjectId(commentId)) {
    throw new ApiError(400, "Invalid comment id")
  }

  const comment = await Comment.findById(commentId)

  if (!comment) {
    throw new ApiError(404, "Comment not found")
  }

  if (!comment.owner.equals(req.user?._id)) {
    throw new ApiError(403, "You are not authorized to delete this comment")
  }

  const deletedResult = await comment.deleteOne()

  if (deletedResult.deletedCount !== 1) {
    throw new ApiError(500, "Failed to delete the comment")
  }

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Comment Deleted successfully"))
})

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

  if (limitedComments.totalDocs === 0) {
    throw new ApiError(404, "No comments found")
  }

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