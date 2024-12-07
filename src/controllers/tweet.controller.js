import mongoose, { isValidObjectId } from "mongoose"
import { Tweet } from "../models/tweet.model.js"
import { ApiError } from "../utils/apiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { Like } from "../models/like.model.js"

//Create a new tweet
const createTweet = asyncHandler(async (req, res) => {
  const { content } = req.body

  if (!content?.trim()) {
    throw new ApiError(400, 'Content is required')
  }

  const tweet = await Tweet.create({
    content,
    owner: req.user?._id
  })

  return res
    .status(200)
    .json(new ApiResponse(200, tweet, "Tweet created successfully"))

})

// Update an existing tweet
const updateTweet = asyncHandler(async (req, res) => {
  const { tweetId } = req.params;
  const { content } = req.body

  if (!content?.trim()) {
    throw new ApiError(400, "content is required")
  }

  if ((!isValidObjectId(tweetId))) {
    throw new ApiError(400, 'Invalid tweet id')
  }

  const updatedTweet = await Tweet.findOneAndUpdate(
    {
      _id: tweetId,
      owner: req.user?._id
    },
    { content: content },
    { new: true }
  )

  if (!updatedTweet) {
    throw new ApiError(404, "Tweet not found or you don't have permission to update it");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, updatedTweet, 'tweet updated successfully'))

})

// Delete an existing tweet
const deleteTweet = asyncHandler(async (req, res) => {
  const { tweetId } = req.params;

  if ((!isValidObjectId(tweetId))) {
    throw new ApiError(400, 'Invalid tweet id')
  }

  const deletedTweet = await Tweet.findOneAndDelete({
    _id: tweetId,
    owner: req.user?._id
  })

  if (!deletedTweet) {
    throw new ApiError(404, 'No tweet found or you are not authorized to delete this tweet')
  }

  // Delete all the associated likes
  await Like.deleteMany({ tweet: tweetId })

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Tweet deleted successfully"))

})

// Get all tweets for a specific user
const getUserTweets = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  if (!userId) {
    throw new ApiError(400, "user id is missing")
  }

  if ((!isValidObjectId(userId))) {
    throw new ApiError(400, 'Invalid user id')
  }

  const tweetsList = await Tweet.aggregate([
    {
      $match: {
        owner: new mongoose.Types.ObjectId(userId)
      }
    },
    {
      $lookup: {
        from: 'users',
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
          },
        ])
      }
    },
    {
      $lookup: {
        from: "likes",
        localField: "_id",
        foreignField: "tweet",
        as: "likes",
        pipeline: [
          {
            $project: {
              likedBy: 1,
            },
          },
        ],
      },
    },
    {
      $addFields: {
        likesCount: {
          $size: "$likes",
        },
        owner: {
          $first: "$owner",
        },
        isLiked: {
          $cond: {
            if: { $in: [req.user?._id, "$likes.likedBy"] },
            then: true,
            else: false
          }
        }
      },
    },
    {
      $sort: {
        createdAt: -1
      }
    },
    {
      $project: {
        content: 1,
        owner: 1,
        likesCount: 1,
        createdAt: 1,
        updatedAt: 1,
        isLiked: 1
      },
    },
  ]);

  return res
    .status(200)
    .json(new ApiResponse(200, tweetsList, 'Tweets fetched successfully'))

})

export {
  createTweet,
  getUserTweets,
  updateTweet,
  deleteTweet
}
