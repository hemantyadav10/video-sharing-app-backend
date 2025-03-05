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

  // Delete all likes associated with the comment and replies
  await Like.deleteMany({
    comment: {
      $in: [
        commentId, // Deletes likes of the main comment
        ...await Comment.find({ parentId: commentId }).distinct('_id') // Deletes likes of all replies
      ]
    }
  });

  // Delete all replies associated with the comment
  await Comment.deleteMany({ parentId: commentId });

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
        isLiked: 1,
        repliesCount: 1
      }
    }
  ])

  const limitedComments = await Comment.aggregatePaginate(comments, {
    limit: Number(limit),
    page: Number(page),
    sort: { "createdAt": sortBy === 'newest' ? -1 : 1 }
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

export {
  addComment,
  deleteComment,
  updateComment,
  getVideoComments,
  fetchCommentReplies
}