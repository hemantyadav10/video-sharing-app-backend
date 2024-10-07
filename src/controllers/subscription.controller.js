import mongoose, { isValidObjectId } from "mongoose"
import { ApiError } from "../utils/apiError.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { User } from "../models/user.model.js"
import { Subscription } from "../models/subscription.model.js"
import { ApiResponse } from "../utils/ApiResponse.js"

//Toggles subscription for a user to a channel
const toggleSubscription = asyncHandler(async (req, res) => {
  const { channelId } = req.params

  if (!channelId) {
    throw new ApiError(400, 'Channel id is missing')
  }

  if (!(isValidObjectId(channelId))) {
    throw new ApiError(400, 'Invalid Channel id')
  }

  // Check if the channel exists
  const channel = await User.findById(channelId)
  if (!channel) {
    throw new ApiError(404, "Channel does not exist")
  }

  // Check if the user is trying to subscribe to their own channel
  if (channel._id.equals(req.user._id)) {
    throw new ApiError(400, "You cannot subscribe to your own channel");
  }

  // Check if the user has already subscribed to the channel
  const hasSubscribed = await Subscription.findOne({
    subscriber: req.user?._id,
    channel: channelId
  })

  // If not subscribed, create a new subscription
  if (!hasSubscribed) {
    const subscription = await Subscription.create({
      subscriber: req.user?._id,
      channel: channelId
    })

    if (!subscription) {
      throw new ApiError(500, "Failed to subscribe")
    }

    return res
      .status(200)
      .json(new ApiResponse(200, subscription, "Channel subscribed successfully"))
  }

  // If already subscribed, delete the subscription
  const unsubscribedChannel = await hasSubscribed.deleteOne()

  // Check if the unsubscription was successful
  if (unsubscribedChannel.deletedCount !== 1) {
    throw new ApiError(500, 'Failed to unsubscribe')
  }

  return res
    .status(200)
    .json(new ApiResponse(200, {}, 'Channel unsubscribed successfully'))

})

// Retrieves channels the subscriber is subscribed to, including subscriber count for each channel.
const getSubscribedChannels = asyncHandler(async (req, res) => {
  const { subscriberId } = req.params

  if (!subscriberId) {
    throw new ApiError(400, 'Subscriber id is missing')
  }

  if (!(isValidObjectId(subscriberId))) {
    throw new ApiError(400, 'Invalid subscriber id')
  }

  // Check if the subscriber exists in the User collection
  const subscriber = await User.findById(subscriberId)
  if (!subscriber) {
    throw new ApiError(404, 'Subscriber does not exist')
  }

  // Fetch the channels the subscriber is subscribed to using aggregation
  const channelsSubscribedTo = await Subscription.aggregate([
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


  if (!channelsSubscribedTo.length) {
    throw new ApiError(404, 'No channels found')
  }

  return res
    .status(200)
    .json(new ApiResponse(200, channelsSubscribedTo, 'Subscribed Channels fetched successfully'))

})

export {
  toggleSubscription,
  getSubscribedChannels,
  getUserChannelSubscribers
}