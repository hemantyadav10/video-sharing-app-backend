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

/**
 * Deletes a tweet and cleans up associated data
 * 
 * Flow:
 * 1. Validates tweet ID format
 * 2. Removes tweet (only if user is owner)
 * 3. Cleans up associated likes with fallback strategy:
 *    - Primary: Immediate deletion
 *    - Fallback: TTL-based cleanup if immediate fails
 * 4. Returns success regardless of like cleanup outcome
 * 
 * Security: Owner-only deletion enforced at database level
 * Resilience: Tweet deletion succeeds even if like cleanup fails
 */
const deleteTweet = asyncHandler(async (req, res) => {
  const { tweetId } = req.params;

  if ((!isValidObjectId(tweetId))) {
    throw new ApiError(400, 'Invalid tweet id')
  }

  // findOneAndDelete with owner filter prevents unauthorized deletions
  const deletedTweet = await Tweet.findOneAndDelete({
    _id: tweetId,
    owner: req.user?._id
  })

  if (!deletedTweet) {
    throw new ApiError(404, 'No tweet found or you are not authorized to delete this tweet')
  }

  // Hybrid cleanup strategy: immediate deletion with TTL fallback
  try {
    await Like.deleteMany({ tweet: tweetId })
  } catch (error) {
    console.log('Immediate like clean up failed trying TTL: ', error.message);

    // TTL fallback: mark likes for automatic expiration
    try {
      await Like.updateMany(
        { tweet: tweetId },
        { tweetDeleted: new Date() }
      );
    } catch (ttlError) {
      // Log for monitoring but don't fail the request - orphaned likes are acceptable
      console.log('Both like cleanup methods failed for tweet: ', tweetId, ttlError.message);

      // TODO: Add to cleanup queue for background processing or alert monitoring system
    }
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { _id: deletedTweet?._id }, "Tweet deleted successfully"))

})

// Get all tweets for a specific user
const getUserTweets = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { limit } = req.query;

  if (!userId) {
    throw new ApiError(400, "user id is missing")
  }

  if ((!isValidObjectId(userId))) {
    throw new ApiError(400, 'Invalid user id')
  }

  const pipeline = [
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
  ]

  if (limit && !isNaN(limit)) {
    pipeline.push({
      $limit: parseInt(limit, 10),
    });
  }

  const tweetsList = await Tweet.aggregate(pipeline);

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
