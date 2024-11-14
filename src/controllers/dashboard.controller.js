import { asyncHandler } from '../utils/asyncHandler.js';
import { Video } from '../models/video.model.js';
import mongoose from 'mongoose';
import { ApiResponse } from '../utils/ApiResponse.js';
import { Subscription } from '../models/subscription.model.js';

const getChannelVideos = asyncHandler(async (req, res) => {
  const videos = await Video.aggregate([
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

  return res
    .status(200)
    .json(new ApiResponse(200, videos, 'Channel videos fetched successfully'))
})

const getChannelStats = asyncHandler(async (req, res) => {
  // TODO: Get the channel stats like total video views, total subscribers, total videos, total likes etc.
  const userId = new mongoose.Types.ObjectId(req.user?._id);

  const [totalSubscribers, totalVideos] = await Promise.all([
    Subscription.countDocuments({ channel: userId }),
    Video.aggregate([
      // Match videos owned by the user
      {
        $match: {
          owner: userId
        }
      },
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
    ])
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