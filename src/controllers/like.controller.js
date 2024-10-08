import mongoose, { isValidObjectId } from "mongoose"
import { Like } from "../models/like.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { Video } from '../models/video.model.js'
import { Comment } from '../models/comment.model.js'
import { Tweet } from '../models/tweet.model.js'

// Toggle the like status of a video (like if not liked, unlike if already liked)
const toggleVideoLike = asyncHandler(async (req, res) => {
  const { videoId } = req.params

  if (!videoId) {
    throw new ApiError(400, "Video id is missing")
  }

  if (!(isValidObjectId(videoId))) {
    throw new ApiError(400, 'Invalid id')
  }

  // Check if the user has already liked the video
  const hasLiked = await Like.findOne({
    likedBy: req.user?._id,
    video: videoId
  })

  // If the user has not liked the video yet
  if (!hasLiked) {
    const video = await Video.findById(videoId)

    if (!video) {
      throw new ApiError(404, "Video not found")
    }

    // Create a new like entry for the video
    const like = await Like.create({
      video: videoId,
      likedBy: req.user?._id
    })

    if (!like) {
      throw new ApiError(500, "Failed to like video")
    }

    return res
      .status(200)
      .json(new ApiResponse(200, like, "Video liked successfully"))
  }

  // If the user has already liked the video, unlike it
  await Like.findByIdAndDelete(hasLiked?._id)

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Video unliked successfully"))
})

// Toogle like status of a comment
const toggleCommentLike = asyncHandler(async (req, res) => {
  const { commentId } = req.params

  if (!commentId) {
    throw new ApiError(400, "Comment id is missing")
  }

  if (!(isValidObjectId(commentId))) {
    throw new ApiError(400, 'Invalid id')
  }

  // Check if the user has already liked the comment
  const hasLiked = await Like.findOne({
    likedBy: req.user?._id,
    comment: commentId
  })

  // If the user has not liked the comment yet
  if (!hasLiked) {
    const comment = await Comment.findById(commentId)

    if (!comment) {
      throw new ApiError(404, "Comment not found")
    }

    // Create a new like entry for the comment
    const like = await Like.create({
      comment: commentId,
      likedBy: req.user?._id
    })

    if (!like) {
      throw new ApiError(500, "Failed to like comment")
    }

    return res
      .status(200)
      .json(new ApiResponse(200, like, "Comment liked successfully"))
  }

  // If the user has already liked the comment, unlike it
  await Like.findByIdAndDelete(hasLiked?._id)

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Comment unliked successfully"))
})

// Toogle like status of a tweet
const toggleTweetLike = asyncHandler(async (req, res) => {
  const { tweetId } = req.params

  if (!tweetId?.trim()) {
    throw new ApiError(400, "Tweet id is missing")
  }

  if (!(isValidObjectId(tweetId))) {
    throw new ApiError(400, 'Invalid id')
  }

  const hasLiked = await Like.findOne({
    likedBy: req.user?._id,
    tweet: tweetId
  })

  if (!hasLiked) {
    const tweet = await Tweet.findById(tweetId)

    if (!tweet) {
      throw new ApiError(404, "Tweet not found")
    }

    const like = await Like.create({
      tweet: tweetId,
      likedBy: req.user?._id
    })

    if (!like) {
      throw new ApiError(500, "Failed to like the tweet")
    }

    return res
      .status(200)
      .json(new ApiResponse(200, like, "Tweet liked successfully"))
  }

  await Like.findByIdAndDelete(hasLiked?._id)

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Tweet unliked successfully"))
}
)

// Get all liked videos
const getLikedVideos = asyncHandler(async (req, res) => {

  const likedVideos = await Like.aggregate([
    {
      $match: {
        likedBy: new mongoose.Types.ObjectId(req.user?.id),
        video: { $exists: true, $ne: null }
      },
    },
    {
      $lookup: {
        from: "videos",
        localField: "video",
        foreignField: "_id",
        as: "video",
        pipeline: ([
          {
            $lookup: {
              from: "users",
              localField: "owner",
              foreignField: "_id",
              as: "video_owner",
              pipeline: ([
                {
                  $project: {
                    fullName: 1,
                    username: 1,
                    avatar: 1
                  }
                }
              ])
            }
          },
          {
            $addFields: {
              video_owner: {
                $first: "$video_owner"
              }
            }
          },
          {
            $project: {
              createdAt: 1,
              updatedAt: 1,
              thumbnail: 1,
              title: 1,
              description: 1,
              duration: 1,
              views: 1,
              video_owner: 1
            }
          },

        ])
      }
    },
    {
      $addFields: {
        video: {
          $first: "$video"
        }
      }
    },
    {
      $project: {
        _id: 0,
        createdAt: 1,
        video: 1,
      }
    }
  ])


  if (likedVideos?.length === 0) {
    return res
      .status(200)
      .json(new ApiResponse(404, {}, "No liked videos found"))
  }

  return res
    .status(200)
    .json(new ApiResponse(200, likedVideos, "Liked videos fetched successfully"))
})

export {
  toggleCommentLike,
  toggleTweetLike,
  toggleVideoLike,
  getLikedVideos
}