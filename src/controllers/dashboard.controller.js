import { asyncHandler } from '../utils/asyncHandler.js';
import { Video } from '../models/video.model.js';
import mongoose, { isValidObjectId } from 'mongoose';
import { ApiResponse } from '../utils/ApiResponse.js';
import { Subscription } from '../models/subscription.model.js';
import { ApiError } from '../utils/apiError.js';


const SORT_ORDER = {
  asc: 1,
  desc: -1
}

const getChannelVideos = asyncHandler(async (req, res) => {
  const { limit = 12, page = 1, sortBy = "createdAt", sortOrder = "desc" } = req.query

  if (!['createdAt', "likes", "views", "title"].includes(sortBy) || !["desc", "asc"].includes(sortOrder)) {
    throw new ApiError(400, "Invalid sorting options")
  }

  const pipeline = Video.aggregate([
    {
      $match: {
        owner: new mongoose.Types.ObjectId(req.user?._id)
      }
    },
    {
      $lookup: {
        from: 'likes',
        localField: '_id',
        foreignField: 'video',
        as: 'likes'
      }
    },
    {
      $addFields: {
        likes: {
          $size: "$likes"
        },
      }
    },

  ])

  const videos = await Video.aggregatePaginate(pipeline, {
    limit: parseInt(limit),
    page: parseInt(page),
    sort: { [sortBy]: SORT_ORDER[sortOrder] }
  })

  return res
    .status(200)
    .json(new ApiResponse(200, videos, 'Channel videos fetched successfully'))
})

const getChannelStats = asyncHandler(async (req, res) => {
  // TODO: Get the channel stats like total video views, total subscribers, total videos, total likes etc.
  const { channelId } = req.params
  const { allVideos } = req.query

  if (!isValidObjectId(channelId)) {
    throw new ApiError(400, 'Invalid channel id')
  }

  const pipeline = [
    // Perform a lookup to join with the likes collection
    {
      $lookup: {
        from: 'likes',
        localField: '_id',      // Match each video's _id
        foreignField: 'video',  // with each like's 'video' field
        as: 'likes'
      }
    },
    // Calculate totalLikes by counting likes for each video
    {
      $addFields: {
        likesCount: { $size: "$likes" } // Add a field for count of likes per video
      }
    },
    // Group by null to aggregate results across all videos
    {
      $group: {
        _id: null,
        totalVideos: { $sum: 1 },             // Count the total videos
        totalLikes: { $sum: "$likesCount" },  // Sum the likes count across videos
        totalViews: { $sum: "$views" }        // Sum the views count across videos
      }
    },
    // Project the final result fields and remove the _id field
    {
      $project: {
        _id: 0,
        totalVideos: 1,
        totalLikes: 1,
        totalViews: 1
      }
    }
  ]

  if (allVideos === "true") {
    pipeline.unshift({
      $match: {
        owner: new mongoose.Types.ObjectId(channelId),
      }
    })
  } else if (allVideos === "false") {
    pipeline.unshift({
      $match: {
        owner: new mongoose.Types.ObjectId(channelId),
        isPublished: true
      }
    })
  }


  const [totalSubscribers, totalVideos] = await Promise.all([
    Subscription.countDocuments({ channel: channelId }),
    Video.aggregate(pipeline)
  ]);


  // Set default values if the aggregation returns an empty array
  const stats = {
    totalVideos: totalVideos[0]?.totalVideos || 0,
    totalLikes: totalVideos[0]?.totalLikes || 0,
    totalViews: totalVideos[0]?.totalViews || 0,
    totalSubscribers
  }

  return res
    .status(200)
    .json(new ApiResponse(200, stats, 'Channel stats fetched successfully'))

})

export {
  getChannelVideos,
  getChannelStats
}