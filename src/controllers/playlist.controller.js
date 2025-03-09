import mongoose, { isValidObjectId } from "mongoose"
import { Playlist } from "../models/playlist.model.js"
import { ApiError } from "../utils/apiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { User } from "../models/user.model.js"

// Create a new playlist
const createPlaylist = asyncHandler(async (req, res) => {
  const { name, description } = req.body

  if (!name?.trim() || !description.trim()) {
    throw new ApiError(400, "All fields are required")
  }

  const createdPlaylist = await Playlist.create({
    name,
    description,
    videos: [],
    owner: req.user?._id
  })

  if (!createdPlaylist) {
    throw new ApiError(500, 'Failed to create playlist')
  }

  return res
    .status(200)
    .json(new ApiResponse(200, createdPlaylist, 'Playlist created successfully'))
})

// Get all playlists created by a user
const getUserPlaylists = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  if (!userId) {
    throw new ApiError(400, "User id is missing")
  }

  const user = await User.findById(userId)

  if (!user) {
    throw new ApiError(404, "User not found")
  }

  const userPlaylist = await Playlist.aggregate([
    {
      $match: {
        owner: new mongoose.Types.ObjectId(userId)
      }
    },
    {
      $lookup: {
        from: "videos",
        foreignField: "_id",
        localField: "videos",
        as: "videos",
        pipeline: ([
          {
            $project: { _id: 1, thumbnail: 1 }
          }
        ])
      }
    },
    {
      $project: {
        name: 1,
        videos: { $map: { input: "$videos", as: "video", in: "$$video._id" } },
        totalVideos: { $size: "$videos" },
        thumbnail: { $arrayElemAt: ["$videos.thumbnail", 0] },
        description: 1,
        createdAt: 1,
        updatedAt: 1, 
        owner: 1
      }
    }
  ])

  return res
    .status(200)
    .json(new ApiResponse(200, userPlaylist, 'User playlist fetched successfully')
    )
  //TODO: get user playlists
})

// Get playlist details and video details by playlist id
const getPlaylistById = asyncHandler(async (req, res) => {
  const { playlistId } = req.params

  if (!playlistId) {
    throw new ApiError(400, "Playlist id is missing")
  }

  if (!(isValidObjectId(playlistId))) {
    throw new ApiError(400, "Invalid playlist id")
  }

  // First stage: Match the playlist and ensure it exists
  // const playlist = await Playlist.aggregate([
  //   {
  //     $match: { _id: new mongoose.Types.ObjectId(playlistId) },
  //   },
  //   {
  //     $project: { _id: 1 } 
  //   }
  // ]);

  // if (playlist.length === 0) {
  //   throw new ApiError(404, 'Playlist not found')
  // }

  // Now perform the lookups only after confirming the playlist exists
  const fullPlaylistData = await Playlist.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(playlistId)
      }
    },
    {
      $lookup: {
        from: "videos",
        localField: "videos",
        foreignField: "_id",
        as: "videos",
        pipeline: ([
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
                    username: 1
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
            $project: {
              thumbnail: 1,
              duration: 1,
              title: 1,
              owner: 1,
              views: 1,
              createdAt: 1,
              updatedAt: 1
            }
          }
        ])
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
        },
        totalVideos: {
          $size: "$videos"
        }
      }
    },
  ])


  return res
    .status(200)
    .json(new ApiResponse(200, fullPlaylistData[0], 'Playlist data fetched successfully'))
})

// Add video to playlist
const addVideoToPlaylist = asyncHandler(async (req, res) => {
  const { playlistId, videoId } = req.params

  if (!playlistId || !videoId) {
    throw new ApiError(400, "playlist id or video id is missing")
  }

  if (!(isValidObjectId(playlistId)) || !(isValidObjectId(videoId))) {
    throw new ApiError(400, "Invalid Id's")
  }


  const playlist = await Playlist.findById(playlistId);

  if (!playlist) {
    throw new ApiError(404, "Playlist not found")
  }

  // Check if the video already exists in the playlist
  if (playlist.videos.includes(videoId)) {
    throw new ApiError(400, "Video is already in the playlist")
  }

  const updatedPlaylist = await Playlist.findByIdAndUpdate(
    playlistId,
    {
      $push: {
        videos: videoId
      }
    },
    { new: true }
  )

  if (!updatedPlaylist) {
    throw new ApiError(404, "Failed to add video to playlist");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, updatedPlaylist, 'Video added to playlist successfully'));

})

// Remove video from playlist
const removeVideoFromPlaylist = asyncHandler(async (req, res) => {
  const { playlistId, videoId } = req.params

  if (!playlistId || !videoId) {
    throw new ApiError(400, "playlist id or video id is missing")
  }

  if (!(isValidObjectId(playlistId)) || !(isValidObjectId(videoId))) {
    throw new ApiError(400, "Invalid Ids")
  }

  // Find the playlist
  const playlist = await Playlist.findById(playlistId)

  if (!playlist) {
    throw new ApiError(404, "Playlist not found")
  }

  // Check if the current user is the owner of the playlist
  if (!(playlist.owner.equals(req.user?._id))) {
    throw new ApiError(403, "You are not authorized to remove videos from this playlist")
  }

  // Check if the video exists in the playlist before attempting to remove it
  const videoExists = playlist.videos.includes(videoId);

  if (!videoExists) {
    throw new ApiError(404, "Video not found in the playlist");
  }

  playlist.videos.pull(videoId);
  const updatedPlaylist = await playlist.save();

  if (!updatedPlaylist) {
    throw new ApiError(500, 'Failed to remove video from playlist')
  }

  return res
    .status(200)
    .json(new ApiResponse(200, updatedPlaylist, 'Video removed successfully'))
})

// Delete playlist
const deletePlaylist = asyncHandler(async (req, res) => {
  const { playlistId } = req.params

  if (!playlistId) {
    throw new ApiError(400, "Playlist id is missing")
  }

  if (!(isValidObjectId(playlistId))) {
    throw new ApiError(400, "Invalid playlist id")
  }

  const playlist = await Playlist.findById(playlistId)

  if (!playlist) {
    throw new ApiError(404, "Playlist not found")
  }

  if (!(playlist.owner.equals(req.user?.id))) {
    throw new ApiError(403, "You are not authorized to delete this playlist")
  }

  const deletedPlaylist = await playlist.deleteOne()

  return res
    .status(200)
    .json(new ApiResponse(200, {}, 'Playlist deleted successfully'))
})

// Update playlist (name or description of playlist)
const updatePlaylist = asyncHandler(async (req, res) => {
  const { playlistId } = req.params
  const { name, description } = req.body

  if (!playlistId) {
    throw new ApiError(400, 'Playlist id is missing')
  }

  if (!(isValidObjectId(playlistId))) {
    throw new ApiError(400, "Invalid playlist id")
  }

  if (!name?.trim() && !description?.trim()) {
    throw new ApiError(400, "Atleast one field is required")
  }

  const playlist = await Playlist.findById(playlistId)

  if (!playlist) {
    throw new ApiError(404, "Playlist not found")
  }

  if (!(playlist.owner.equals(req.user?._id))) {
    throw new ApiError(403, "You are not authorized to update this playlist")
  }

  const updateFields = {};

  if (name?.trim()) {
    updateFields.name = name.trim();
  }
  if (description?.trim()) {
    updateFields.description = description.trim();
  }

  const updatedPlaylist = await Playlist.findByIdAndUpdate(
    playlistId,
    {
      $set: updateFields
    },
    { new: true }
  )

  if (!updatedPlaylist) {
    throw ApiError(500, 'Failed to update playlist')
  }

  return res
    .status(200)
    .json(new ApiResponse(200, updatedPlaylist, 'Playlist updated successfully'))

})

export {
  createPlaylist,
  getUserPlaylists,
  getPlaylistById,
  addVideoToPlaylist,
  removeVideoFromPlaylist,
  deletePlaylist,
  updatePlaylist
}