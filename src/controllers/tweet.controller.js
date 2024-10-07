import mongoose, { isValidObjectId } from "mongoose"
import { Tweet } from "../models/tweet.model.js"
import { ApiError } from "../utils/apiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"

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

  if (!tweet) {
    throw new ApiError(500, 'Failed to create a tweet')
  }

  return res
    .status(200)
    .json(new ApiResponse(200, tweet, "Tweet created successfully"))

})

// Update an existing tweet
const updateTweet = asyncHandler(async (req, res) => {
  const { tweetId } = req.params;
  const { content } = req.body

  if (!tweetId) {
    throw new ApiError(400, "tweet id is missing")
  }

  if (!content?.trim()) {
    throw new ApiError(400, "content is required")
  }

  if ((!isValidObjectId(tweetId))) {
    throw new ApiError(400, 'Invalid tweet id')
  }

  const tweet = await Tweet.findById(tweetId)

  if (!tweet) {
    throw new ApiError(400, "No Tweet found")
  }

  if (!(tweet.owner.equals(req.user?._id))) {
    throw new ApiError(403, 'You are not authorized to update this tweet')
  }

  tweet.content = content;

  const updatedTweet = await tweet.save();

  if (!updatedTweet) {
    throw new ApiError(500, 'Failed to update tweet')
  }

  return res
    .status(200)
    .json(new ApiResponse(200, updatedTweet, 'tweet updated successfully'))

})

// Delete an existing tweet
const deleteTweet = asyncHandler(async (req, res) => {
  const { tweetId } = req.params;

  if (!tweetId) {
    throw new ApiError(400, "tweet id is missing")
  }

  if ((!isValidObjectId(tweetId))) {
    throw new ApiError(400, 'Invalid tweet id')
  }

  const tweet = await Tweet.findById(tweetId)

  if (!tweet) {
    throw new ApiError(400, "No Tweet found")
  }

  if (!(tweet.owner.equals(req.user?._id))) {
    throw new ApiError(403, 'You are not authorized to delete this tweet')
  }

  const deletedTweet = await tweet.deleteOne()

  if (deletedTweet.deletedCount !== 1) {
    throw new ApiError(500, "Failed to delete the tweet")
  }

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
      $addFields: {
        owner: {
          $first: "$owner"
        }
      }
    },
    {
      $sort: {
        updatedAt: -1
      }
    }
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
