import { Video } from '../models/video.model.js';
import { ApiError } from '../utils/apiError.js'
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { uploadOnCloudinary } from '../utils/cloudinary.js';

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

export {
  publishVideo
}