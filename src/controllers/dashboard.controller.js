import { asyncHandler } from '../utils/asyncHandler.js';
import { Video } from '../models/video.model.js';
import mongoose from 'mongoose';
import { ApiResponse } from '../utils/ApiResponse.js';

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

export {
  getChannelVideos
}