import { Video } from '../models/video.model.js';
import { ApiError } from '../utils/apiError.js'
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { uploadOnCloudinary } from '../utils/cloudinary.js';
import mongoose, { isValidObjectId } from 'mongoose';

// publish user video
const publishVideo = asyncHandler(async (req, res) => {
  const { title, description } = req.body;

  if (!title?.trim() || !description?.trim()) {
    throw new ApiError(400, "All fields are required");
  }

  const videoLocalPath = req?.files?.video?.[0]?.path
  const thumbnailLocalPath = req?.files?.thumbnail?.[0]?.path

  if (!videoLocalPath && !thumbnailLocalPath) {
    throw new ApiError(400, 'video and thumbnail file are required')
  }

  const [video, thumbnail] = await Promise.all([
    uploadOnCloudinary(videoLocalPath),
    uploadOnCloudinary(thumbnailLocalPath)
  ])

  if (!video || !thumbnail) {
    throw new ApiError(500, 'Something went wrong while publishing the video')
  }

  const videoDetails = await Video.create({
    videoFile: video?.url,
    thumbnail: thumbnail?.url,
    title,
    description,
    duration: video?.duration,
    owner: req.user?._id
  })

  if (!videoDetails) {
    throw new ApiError(500, 'Something went wrong while publishing video')
  }

  return res
    .status(200)
    .json(new ApiResponse(200, videoDetails, 'Video published successfully'))

})

//  Retrieves a video by its ID and returns its details.
const getVideoById = asyncHandler(asyncHandler(async (req, res) => {
  const { videoId } = req.params

  if (!videoId) {
    throw new ApiError(400, 'video id is missing');
  }

  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, 'Invalid video id')
  }


  const video = await Video.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(videoId)
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
              fullName: 1,
              username: 1,
              avatar: 1,
            },
          },
        ])
      },
    },
    {
      $addFields: {
        owner: {
          $first: "$owner"
        }
      }
    }
  ])

  if (!video) {
    throw new ApiError(404, "video does not exist")
  }

  return res
    .status(200)
    .json(new ApiResponse(200, video[0], 'Video fetched successfully'))
}))

// Deletes a video by its ID.
const deleteVideo = asyncHandler(asyncHandler(async (req, res) => {
  const { videoId } = req.params

  if (!videoId) {
    throw new ApiError(400, 'video id is missing');
  }
  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, 'Invalid video id')
  }

  const video = await Video.findByIdAndDelete(videoId)


  if (!video) {
    throw new ApiError(404, "Video does not exists")
  }

  return res
    .status(200)
    .json(new ApiResponse(200, {}, 'Video deleted successfully'))

}))

// Updates video details (title, description, and thumbnail).
const updateVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params
  const { title, description } = req.body
  const thumbnailLocalPath = req?.file?.path

  if (!title?.trim() && !description?.trim() && !thumbnailLocalPath) {
    throw new ApiError(400, 'Atleast one field is required')
  }

  let thumbnail;
  if (thumbnailLocalPath) {
    thumbnail = await uploadOnCloudinary(thumbnailLocalPath)
    if (!thumbnail) throw new ApiError(500, 'Something went wrong while uploading thumbnail')
  }

  const video = await Video.findByIdAndUpdate(
    videoId,
    {
      $set: {
        ...(title && { title }),
        ...(description && { description }),
        ...(thumbnail && { thumbnail: thumbnail.url }),
      }
    },
    { new: true }

  )

  if (!video) {
    throw ApiError(500, 'Error occured while updation video')
  }

  return res
    .status(200)
    .json(new ApiResponse(200, video, 'Video details updated successfully'))

})


export {
  publishVideo,
  getVideoById,
  deleteVideo,
  updateVideo
}