import mongoose, { isValidObjectId } from "mongoose"
import { ApiError } from "../utils/apiError.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { User } from "../models/user.model.js"
import { Subscription } from "../models/subscription.model.js"
import { ApiResponse } from "../utils/ApiResponse.js"

//Toggles subscription for a user to a channel
const toggleSubscription = asyncHandler(async (req, res) => {
  const { channelId } = req.params

  if (!(isValidObjectId(channelId))) {
    throw new ApiError(400, 'Invalid Channel id')
  }

  const isSubscribed = await Subscription.findOneAndDelete({
    subscriber: req.user?._id,
    channel: channelId
  });

  if (isSubscribed) {
    return res
      .status(200)
      .json(new ApiResponse(200, { subscribed: false }, "Channel unsubscribed successfully "))
  }

  // Check if the channel exists
  const channel = await User.findById(channelId)
  if (!channel) {
    throw new ApiError(404, "Channel does not exist")
  }

  await Subscription.create({
    subscriber: req.user?._id,
    channel: channelId
  })

  return res
    .status(200)
    .json(new ApiResponse(200, { subscribed: true }, "Channel Subscribed successfully "))
})

// Retrieves channels the subscriber is subscribed to, including subscriber count for each channel.
const getSubscribedChannels = asyncHandler(async (req, res) => {
  const { subscriberId } = req.params
  const { limit = 6, page = 1 } = req.query


  if (!(isValidObjectId(subscriberId))) {
    throw new ApiError(400, 'Invalid subscriber id')
  }

  const pipeline = Subscription.aggregate([
    {
      $match: {
        subscriber: new mongoose.Types.ObjectId(subscriberId)
      }
    },
    {
      $lookup: {
        from: "users",
        localField: "channel",
        foreignField: "_id",
        as: "channel",
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
              }
            }
          },
          {
            $project: {
              fullName: 1,
              username: 1,
              avatar: 1,
              subscribersCount: 1
            },
          },
        ])
      }
    },
    {
      $addFields: {
        channel: {
          $first: "$channel"
        }
      }
    }
  ])
  const channelsSubscribedTo = await Subscription.aggregatePaginate(pipeline, {
    limit: parseInt(limit) || 6,
    page: parseInt(page) || 1,
    sort: { createdAt: -1 }
  })

  return res
    .status(200)
    .json(new ApiResponse(200, channelsSubscribedTo, 'Subscribed Channels fetched successfully'))

})


const fetchSubscribedChannelVideos = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query

  const videoAggregate = Subscription.aggregate([
    {
      $match: {
        subscriber: new mongoose.Types.ObjectId(req.user?._id)
      }
    },
    {
      $lookup: {
        from: 'videos',
        localField: 'channel',
        foreignField: 'owner',
        as: 'videos',
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
                    username: 1,
                    fullName: 1,
                    avatar: 1,
                  }
                },
              ])
            }
          },
          {
            $set: {
              owner: { $arrayElemAt: ["$owner", 0] }
            }
          }
        ])
      }
    },
    { $unwind: "$videos" },
    {
      $project: {
        _id: "$videos._id",
        thumbnail: "$videos.thumbnail",
        title: "$videos.title",
        description: "$videos.description",
        createdAt: "$videos.createdAt",
        updateAt: "$videos.updatedAt",
        views: "$videos.views",
        owner: "$videos.owner",
        duration: "$videos.duration"
      }
    },
    { $sort: { createdAt: -1 } }
  ])

  const videos = await Subscription.aggregatePaginate(
    videoAggregate, {
    page: parseInt(page),
    limit: parseInt(limit)
  }
  )


  return res
    .status(200)
    .json(new ApiResponse(200, videos, 'Videos fetched successfully'))
})

const getUserChannelSubscribers = asyncHandler(async (req, res) => {
  const { limit = 6, page = 1, sortField = "createdAt", sortOrder = "desc" } = req.query
  const userId = req?.user._id

  const sortOptions = {};
  if (sortField === "subscribersCount") {
    sortOptions["subscriber.subscribersCount"] = sortOrder === "desc" ? -1 : 1;
  } else {
    sortOptions[sortField] = sortOrder === "desc" ? -1 : 1;
  }

  const pipeline = Subscription.aggregate([
    {
      $match: {
        channel: new mongoose.Types.ObjectId(userId)
      }
    },
    {
      $lookup: {
        from: "users",
        localField: "subscriber",
        foreignField: "_id",
        as: "subscriber",
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
              }
            }
          },
          {
            $project: {
              fullName: 1,
              username: 1,
              avatar: 1,
              subscribersCount: 1
            },
          },
        ])
      }
    },
    {
      $addFields: {
        subscriber: {
          $first: "$subscriber"
        }
      }
    },
    { $sort: sortOptions },
    {
      $project: {
        subscriber: 1,
        createdAt: 1,
        updatedAt: 1
      }
    }
  ])
  const subscribers = await Subscription.aggregatePaginate(pipeline, {
    limit: parseInt(limit) || 6,
    page: parseInt(page) || 1,
  })

  return res
    .status(200)
    .json(new ApiResponse(200, subscribers, 'Subscribers fetched successfully'))

})


export {
  toggleSubscription,
  getSubscribedChannels,
  fetchSubscribedChannelVideos,
  getUserChannelSubscribers
}