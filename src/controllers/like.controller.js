import mongoose, { isValidObjectId } from "mongoose"
import { Like } from "../models/like.model.js"
import { ApiError } from "../utils/apiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { Video } from '../models/video.model.js'
import { Comment } from '../models/comment.model.js'
import { Tweet } from '../models/tweet.model.js'

// Toggle the like status of a video (like if not liked, unlike if already liked)
const toggleVideoLike = asyncHandler(async (req, res) => {
  const { videoId } = req.params;

  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, 'Invalid id');
  }

  // Check if the user has already liked the video
  const like = await Like.findOneAndDelete({
    likedBy: req.user?._id,
    video: videoId
  });

  // If a like was found and deleted, respond with unliked
  if (like) {
    return res
      .status(200)
      .json(new ApiResponse(200, like, "Video unliked successfully"));
  }

  // Check if the video exists 
  const video = await Video.findById(videoId).select("_id");
  if (!video) {
    throw new ApiError(404, "Video not found");
  }

  // If no like was found, create a new one
  const newLike = await Like.create({
    video: videoId,
    likedBy: req.user?._id
  });

  if (!newLike) {
    throw new ApiError(500, "Failed to like video");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, newLike, "Video liked successfully"));
});

// Toogle like status of a comment
const toggleCommentLike = asyncHandler(async (req, res) => {
  const { commentId } = req.params

  if (!(isValidObjectId(commentId))) {
    throw new ApiError(400, 'Invalid id')
  }

  const like = await Like.findOneAndDelete({
    likedBy: req.user?._id,
    comment: commentId
  });

  // If a like was found and deleted, respond with unliked
  if (like) {
    return res
      .status(200)
      .json(new ApiResponse(200, {}, "Comment unliked successfully"));
  }

  // Check if the comment exists 
  const comment = await Comment.findById(commentId).select("_id");
  if (!comment) {
    throw new ApiError(404, "Comment not found");
  }

  // If no like was found, create a new one
  const newLike = await Like.create({
    comment: commentId,
    likedBy: req.user?._id
  });

  if (!newLike) {
    throw new ApiError(500, "Failed to like comment");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, newLike, "Comment liked successfully"));
})

// Toogle like status of a tweet
const toggleTweetLike = asyncHandler(async (req, res) => {
  const { tweetId } = req.params

  if (!(isValidObjectId(tweetId))) {
    throw new ApiError(400, 'Invalid id')
  }

  const like = await Like.findOneAndDelete({
    likedBy: req.user?._id,
    tweet: tweetId
  });

  // If a like was found and deleted, respond with unliked
  if (like) {
    return res
      .status(200)
      .json(new ApiResponse(200, {}, "Tweet unliked successfully"));
  }

  // Check if the video exists 
  const tweet = await Tweet.findById(tweetId).select("_id");
  if (!tweet) {
    throw new ApiError(404, "Tweet not found");
  }

  // If no like was found, create a new one
  const newLike = await Like.create({
    tweet: tweetId,
    likedBy: req.user?._id
  });

  if (!newLike) {
    throw new ApiError(500, "Failed to like tweet");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, newLike, "Tweet liked successfully"));
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
              owner: {
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
              owner: 1,
              isLiked: { $literal: true }
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
    },
    {
      $sort: {
        createdAt: -1
      }
    }
  ])


  if (likedVideos?.length === 0) {
    return res
      .status(200)
      .json(new ApiResponse(404, [], "No liked videos found"))
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