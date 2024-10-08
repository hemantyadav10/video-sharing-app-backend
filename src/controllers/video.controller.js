import { User } from '../models/user.model.js';
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

//  Retrieves a video by id and increments views and adds video to watch history of user
const getVideoById = asyncHandler(async (req, res) => {
  const { videoId } = req.params

  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, 'Invalid video id')
  }

  const video = await Video.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(videoId),
        isPublished: true,
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
            $lookup: {
              from: "subscriptions",
              localField: "_id",
              foreignField: "channel",
              as: "subscribers"
            }
          },
          {
            $addFields: {
              subscribersCount: {
                $size: "$subscribers"
              },
              isSubscribed: {
                $cond: {
                  if: { $in: [req.user?._id, "$subscribers.subscriber"] },
                  then: true,
                  else: false
                }
              }
            }
          },
          {
            $project: {
              fullName: 1,
              username: 1,
              avatar: 1,
              subscribersCount: 1,
              isSubscribed: 1
            },
          },
        ])
      },
    },
    {
      $lookup: {
        from: "likes",
        localField: "_id",
        foreignField: "video",
        as: "likes"
      },
    },
    {
      $addFields: {
        owner: {
          $first: "$owner"
        },
        likesCount: {
          $size: "$likes"
        },
        isLiked: {
          $cond: {
            if: { $in: [req.user?._id, "$likes.likedBy"] },
            then: true,
            else: false
          }
        }
      }
    },
    {
      $project: {
        videoFile: 1,
        thumbnail: 1,
        title: 1,
        description: 1,
        duration: 1,
        views: 1,
        owner: 1,
        createdAt: 1,
        updatedAt: 1,
        likesCount: 1,
        isLiked: 1
      }
    }
  ])

  if (video.length === 0) {
    throw new ApiError(404, "Video either does not exist or is unpublished");
  }

  // Increment views safely
  await Video.findByIdAndUpdate(videoId, {
    $inc: {
      views: 1
    }
  });

  // Add to user's watch history only if logged in
  await User.findByIdAndUpdate(req.user?._id, {
    $addToSet: {
      watchHistory: videoId
    }
  });

  return res
    .status(200)
    .json(new ApiResponse(200, video[0], 'Video fetched successfully'))
})

// Deletes a video by its ID.
const deleteVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params

  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, 'Invalid video id')
  }

  const video = await Video.findById(videoId);

  if (!video) {
    throw new ApiError(404, "Video not found")
  }

  if (!(video.owner.equals(req.user?._id))) {
    throw new ApiError(403, "You are not authorized to delete this video")
  }

  const result = await Video.deleteOne({ _id: videoId })

  if (result.deletedCount !== 1) {
    throw new ApiError(500, "Failed to delete video")
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { deleteCount: result.deletedCount }, 'Video deleted successfully'))

})

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

  const video = await Video.findById(videoId)

  if(!video) {
    throw new ApiError(404, "Video not found")
  }

  if(!(video.owner.equals(req.user._id))) {
    throw new ApiError(403, "You are not authorized to update this video")
  }

  const updatedVideo = await Video.findByIdAndUpdate(
    videoId,
    {
      $set: {
        ...(title && { title: title.trim() }),
        ...(description && { description: description.trim() }),
        ...(thumbnail && { thumbnail: thumbnail.url }),
      }
    },
    { new: true }

  )

  if (!updatedVideo) {
    throw ApiError(500, 'Error occured while updating video')
  }

  return res
    .status(200)
    .json(new ApiResponse(200, updatedVideo, 'Video details updated successfully'))

})

// Toggles the publish status of a video (true or false)
const togglePublishStatus = asyncHandler(async (req, res) => {
  const { videoId } = req.params

  if (!(isValidObjectId(videoId))) {
    throw new ApiError(400, "Invalid id")
  }

  const video = await Video.findById(videoId)

  if (!videoId) {
    throw new ApiError(400, "Video not found")
  }

  if (!(video.owner.equals(req.user?._id))) {
    throw new ApiError(403, "You are not authorized to toggle publish status")
  }

  const toggledVideoPublish = await Video.findByIdAndUpdate(
    videoId,
    {
      $set: {
        isPublished: !video.isPublished
      }
    },
    { new: true }
  );

  if (!toggledVideoPublish) {
    throw new ApiError(500, "Failed to toggle video publish status");
  }

  return res
    .status(200)
    .json(new ApiResponse(
      200,
      { isVideoPublished: toggledVideoPublish.isPublished },
      toggledVideoPublish.isPublished ?
        "Video has been successfully made public" :
        "Video has been successfully unpublished")
    )
})


export {
  publishVideo,
  getVideoById,
  deleteVideo,
  updateVideo,
  togglePublishStatus
}