import { User } from '../models/user.model.js';
import { Video } from '../models/video.model.js';
import { Playlist } from '../models/playlist.model.js';
import { ApiError } from '../utils/apiError.js'
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { deleteFromCloudinary, uploadOnCloudinary } from '../utils/cloudinary.js';
import mongoose, { isValidObjectId } from 'mongoose';
import { Like } from '../models/like.model.js';
import { Comment } from '../models/comment.model.js';
import { categories } from '../constants.js'


// publish user video
const publishVideo = asyncHandler(async (req, res) => {
  const { title, description, category, tags } = req.body;
  console.log(tags, typeof tags)

  if (!title?.trim() || !description?.trim() || !category) {
    throw new ApiError(400, "All fields are required");
  }


  if (!categories.includes(category)) {
    throw new ApiError(400, 'Invalid category. Please select a valid category.')
  }

  if (tags && tags.length === 0) {
    throw new ApiError(400, 'Atleast one tag is required.')
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
    throw new ApiError(500, 'Something went wrong while uploading the video')
  }

  const videoDetails = await Video.create({
    videoFile: video?.secure_url,
    video_publicId: video?.public_id,
    thumbnail: thumbnail?.secure_url,
    thumbnail_publicId: thumbnail?.public_id,
    title,
    description,
    duration: video?.duration,
    owner: req.user?._id,
    category,
    tags
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
        isLiked: 1,
        category: 1,
        tags: 1
      }
    }
  ])

  if (video.length === 0) {
    throw new ApiError(404, "Video either does not exist or is unpublished");
  }

  // Increment the view count for the video
  await Video.findByIdAndUpdate(videoId, { $inc: { views: 1 } });

  if (req.user) {
    const today = new Date().toISOString().split('T')[0];
    console.log(today)

    // First, try to update today's entry (add video to existing entry)
    const updatedUser = await User.findOneAndUpdate(
      { _id: req.user._id, "watchHistory.date": today },
      { $addToSet: { "watchHistory.$.videos": videoId } },
      { new: true } // Return the updated document
    );
    console.log(updatedUser)

    // If no update was made (i.e., no entry for today), insert a new entry
    if (!updatedUser) {
      await User.findByIdAndUpdate(req.user._id, {
        $push: { watchHistory: { date: today, videos: [videoId] } }
      },
        { new: true }
      );
    }
  }
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

  const result = await Promise.all([
    Video.deleteOne({ _id: videoId }),
    Comment.deleteMany({ video: videoId }),
    Like.deleteMany({ video: videoId }),
    deleteFromCloudinary({
      public_id: video.video_publicId,
      resource_type: 'video'
    }),
    deleteFromCloudinary({
      public_id: video.thumbnail_publicId,
      resource_type: 'image'
    })
  ])

  const [videoDeleteResult, commentDeleteResult, likeDeleteResult, videoCloudDeleteResult, thumbnailCloudDeleteResult] = result;


  if (videoDeleteResult.deletedCount !== 1) {
    throw new ApiError(500, "Failed to delete video");
  }

  // Only throw an error if there were comments to delete and none were deleted
  if (commentDeleteResult.deletedCount === 0 && (await Comment.countDocuments({ video: videoId })) > 0) {
    throw new ApiError(500, "Failed to delete comments");
  }

  // Only throw an error if there were likes to delete and none were deleted
  if (likeDeleteResult.deletedCount === 0 && (await Like.countDocuments({ video: videoId })) > 0) {
    throw new ApiError(500, "Failed to delete likes");
  }

  if (videoCloudDeleteResult.result !== 'ok') {
    throw new ApiError(500, "Failed to delete video from Cloudinary");
  }

  if (thumbnailCloudDeleteResult.result !== 'ok') {
    throw new ApiError(500, "Failed to delete thumbnail from Cloudinary");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { videoId }, 'Video deleted successfully'))

})

// Updates video details (title, description, and thumbnail).
const updateVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params
  const { title, description, category } = req.body
  let tags = req.body.tags
  const thumbnailLocalPath = req?.file?.path

  // Parse tags if it's a string (for compatibility with FormData)
  if (typeof tags === 'string') {
    tags = JSON.parse(tags);
  }

  // Validation: Ensure tags is an array
  if (tags && !Array.isArray(tags)) {
    throw new ApiError(400, 'Invalid tags format. Tags must be an array.');
  }

  // Validation: At least one field is required
  if (
    !title?.trim() &&
    !description?.trim() &&
    !thumbnailLocalPath &&
    !category &&
    !tags
  ) {
    throw new ApiError(400, 'At least one field is required to update.');
  }

  // Validation: Category should be valid
  if (category && !categories.includes(category)) {
    throw new ApiError(400, 'Invalid category. Please select a valid category.')
  }

  // Validation: Maximum 5 tags allowed
  if (tags?.length > 5) {
    throw new ApiError(400, 'Maximum 5 tags allowed.')
  }

  const video = await Video.findById(videoId)

  if (!video) {
    throw new ApiError(404, "Video not found")
  }

  if (!(video.owner.equals(req.user._id))) {
    throw new ApiError(403, "You are not authorized to update this video")
  }

  const thumbnail_publicId = video.thumbnail_publicId

  let thumbnail;
  if (thumbnailLocalPath) {
    thumbnail = await uploadOnCloudinary(thumbnailLocalPath)
    if (!thumbnail) throw new ApiError(500, 'Something went wrong while uploading thumbnail')
    await deleteFromCloudinary({
      public_id: thumbnail_publicId,
      resource_type: 'image'
    })
  }

  const updatedVideo = await Video.findByIdAndUpdate(
    videoId,
    {
      $set: {
        ...(title && { title: title.trim() }),
        ...(description && { description: description.trim() }),
        ...(thumbnail && { thumbnail: thumbnail.secure_url, thumbnail_publicId: thumbnail.public_id }),
        ...(category && { category: category }),
        ...(tags && { tags: tags }),
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

  const toggledVideoPublish = await Video.findOneAndUpdate(
    { _id: videoId, owner: req.user?._id },
    [{
      $set: {
        isPublished: { $not: "$isPublished" }
      }
    }],
    { new: true }
  ).select('isPublished')

  if (!toggledVideoPublish) {
    throw new ApiError(403, "Video not found or you are not authorized to toggle publish status");
  }

  return res
    .status(200)
    .json(new ApiResponse(
      200,
      toggledVideoPublish,
      toggledVideoPublish.isPublished ?
        "Video has been successfully made public" :
        "Video has been successfully unpublished")
    )
})


const getAllVideos = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, query, sortBy, sortType, userId, category } = req.query;

  // Step 1: Pipeline for `$search` (if query exists)
  let searchResults = null;

  if (query?.trim()) {
    const searchPipeline = [
      {
        $search: {
          index: "videos-title",
          autocomplete: {
            path: "title",
            query: query,
            fuzzy: {
              maxEdits: 1,
            },
            tokenOrder: "sequential",
          },
        },
      },
      { $project: { _id: 1 } },
    ];

    searchResults = await Video.aggregate(searchPipeline);
  }

  // Step 2: Main pipeline
  const pipeline = [];

  // Filter by userId if provided
  if (userId) {
    if (!isValidObjectId(userId)) {
      throw new ApiError(400, "Invalid user ID");
    }
    pipeline.push({
      $match: {
        owner: new mongoose.Types.ObjectId(userId),
      },
    });
  }

  // Filter by `$search` results if applicable
  if (searchResults) {
    const searchIds = searchResults.map((result) => result._id);
    pipeline.push({
      $match: {
        _id: { $in: searchIds },
      },
    });
  }

  // If category exists , filter videos by category
  if (category) {
    if (!categories.includes(category)) {
      throw new ApiError(400, 'Invalid category.')
    } else if (category !== 'trending') {
      pipeline.push({
        $match: {
          category: category
        }
      })
    }
  }

  // Filter published videos
  pipeline.push({
    $match: {
      isPublished: true,
    },
  });

  // Join with the users collection
  pipeline.push(
    {
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "owner",
      },
    },
    {
      $addFields: {
        owner: {
          $first: "$owner",
        },
      },
    }
  );

  // Project fields
  pipeline.push({
    $project: {
      thumbnail: 1,
      title: 1,
      description: 1,
      duration: 1,
      views: 1,
      owner: {
        _id: 1,
        avatar: 1,
        fullName: 1,
        username: 1,
        createdAt: 1,
      },
      createdAt: 1,
      category: 1
    },
  });

  // Step 3: Use `aggregatePaginate` for pagination
  const videoAggregate = Video.aggregate(pipeline);

  const filteredVideos = await Video.aggregatePaginate(videoAggregate, {
    page: parseInt(page),
    limit: parseInt(limit),
    sort: (sortBy && sortType) ? { [sortBy]: sortType === "asc" ? 1 : -1 } : (category === 'trending') ? { views: -1 } : { createdAt: -1 },
  });


  // Step 5: Respond with paginated videos
  return res.status(200).json(
    new ApiResponse(200, filteredVideos, "Videos fetched successfully")
  );
});

const getVideosByTag = asyncHandler(async (req, res) => {
  const { tag } = req.params
  const { limit = 12, page = 1 } = req.query

  const pipeline = Video.aggregate([
    {
      $match: {
        isPublished: true,
        tags: { $in: [new RegExp(tag, 'i')] }, // Match the tag in the tags array(Using a case-insensitive regex)
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "owner",
        pipeline: [{
          $project: {
            _id: 1,
            avatar: 1,
            fullName: 1,
            username: 1,
          }
        }]
      }
    },
    {
      $project: {
        thumbnail: 1,
        title: 1,
        description: 1,
        duration: 1,
        views: 1,
        owner: { $arrayElemAt: ["$owner", 0] },
        createdAt: 1,
        updatedAt: 1,
      }
    }
  ])

  const videos = await Video.aggregatePaginate(pipeline, {
    limit: parseInt(limit) || 12,
    page: parseInt(page) || 1,
    sort: { createdAt: -1 }
  })

  return res
    .status(200)
    .json(new ApiResponse(200, videos, 'Videos fetched successfully'))
})

const getRelatedVideos = asyncHandler(async (req, res) => {
  const { videoId } = req.params
  const { page = 1, limit = 10 } = req.query

  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, 'Invalid video id.')
  }

  const video = await Video.findById(videoId)

  if (!video) {
    throw new ApiError(404, 'Video not found.')
  }

  const aggregationPipeline = Video.aggregate([
    {
      $match: {
        $or: [
          { tags: { $in: video.tags.map(tag => new RegExp(tag, 'i')) } },// Create case-insensitive regex for each tag 
          { category: video.category },
        ],
        _id: { $ne: video._id }
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
              _id: 1,
              avatar: 1,
              fullName: 1,
              username: 1,
            }
          }
        ])
      }
    },
    {
      $project: {
        thumbnail: 1,
        title: 1,
        description: 1,
        duration: 1,
        views: 1,
        createdAt: 1,
        updatedAt: 1,
        owner: { $arrayElemAt: ["$owner", 0] },
        category: 1,
        tags: 1
      }
    }
  ])

  const relatedVideos = await Video.aggregatePaginate(aggregationPipeline, {
    sort: { views: -1 },
    limit: parseInt(limit) || 10,
    page: parseInt(page) || 1
  })

  return res
    .status(200)
    .json(new ApiResponse(200, relatedVideos, 'Related videos fetched successfully'))
})

export {
  publishVideo,
  getVideoById,
  deleteVideo,
  updateVideo,
  togglePublishStatus,
  getAllVideos,
  getVideosByTag,
  getRelatedVideos
}