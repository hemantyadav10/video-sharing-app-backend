import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/apiError.js'
import { ApiResponse } from '../utils/ApiResponse.js'
import { User } from '../models/user.model.js'
import { deleteFromCloudinary, uploadOnCloudinary } from '../utils/cloudinary.js'
import jwt from 'jsonwebtoken'
import mongoose, { isValidObjectId } from 'mongoose'

const refreshCookieOptions = {
  httpOnly: true, // Prevents JavaScript from accessing the cookie
  secure: true,
  maxAge: parseInt(process.env.REFRESH_TOKEN_EXPIRY), // Cookie lifespan in milliseconds for the refresh token, 
  sameSite: 'None', // Required for cross-origin cookies (set in cross-origin requests)
};

const accessCookieOptions = {
  httpOnly: true,
  secure: true,
  maxAge: parseInt(process.env.ACCESS_TOKEN_EXPIRY),
  sameSite: 'None',
};

// Generate and store access and refresh tokens for the user
const generateAccessAndRefreshTokens = async (user) => {
  try {
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken }

  } catch (error) {
    throw new ApiError('Failed to generate tokens:', error)
  }
}

// Handle user registration
const registerUser = asyncHandler(async (req, res) => {

  const { username, email, fullName, password } = req.body;

  // Validate required fields
  if ([username, email, fullName, password].some((field) => !field || field.trim() === '')) {
    throw new ApiError(400, "All fields are required");
  }

  // Check if a user with the same username or email already exists
  const existingUser = await User.findOne({
    $or: [{ username }, { email }]
  });

  if (existingUser) {
    throw new ApiError(409, "User already exists")
  }

  // Get file paths for avatar and cover image from the request
  const avatarLocalPath = req.files?.avatar?.[0]?.path;
  const coverImageLocalPath = req.files?.coverImage?.[0]?.path;

  if (!avatarLocalPath) {
    throw new ApiError(400, 'Avatar file is required')
  }


  // Upload avatar and cover image to Cloudinary
  const avatar = await uploadOnCloudinary(avatarLocalPath);

  let coverImage;

  if (coverImageLocalPath) {
    coverImage = await uploadOnCloudinary(coverImageLocalPath);
  }

  if (!avatar) {
    throw new ApiError(400, 'Avatar file is required')
  }

  // Create a new user
  const user = await User.create({
    username,
    email,
    fullName,
    avatar: avatar.secure_url,
    avatar_publicId: avatar.public_id,
    coverImage: coverImage?.secure_url || "",
    coverImage_publicId: coverImage?.public_id || "",
    password,
  })

  // Fetch and return created user, excluding password and refreshToken
  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  )

  if (!createdUser) {
    throw new ApiError(500, 'Something went wrong while registering the user')
  }

  return res.status(201).json(
    new ApiResponse(200, { userId: createdUser._id }, "Registration successful.")
  )

})

// Handle user login
const loginUser = asyncHandler(async (req, res) => {
  const { username, email, password } = req.body;

  if (!username && !email) {
    throw new ApiError(400, "Either username or email is required");
  }

  if (!password) {
    throw new ApiError(400, "password is required");
  }

  const user = await User.findOne({
    $or: [{ username }, { email }]
  }).select('-watchHistory')

  if (!user) {
    throw new ApiError(404, "User not found with the provided username or email")
  }

  const isPasswordValid = await user.isPasswordCorrect(password);

  if (!isPasswordValid) {
    throw new ApiError(401, 'Invalid credentials')
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user);

  const userResponse = user.toObject();
  delete userResponse.password;
  delete userResponse.refreshToken;

  return res
    .status(200)
    .cookie("accessToken", accessToken, accessCookieOptions)
    .cookie("refreshToken", refreshToken, refreshCookieOptions)
    .json(new ApiResponse(
      200,
      {
        user: userResponse,
        accessToken,
      },
      "User logged in successfully"
    ))
})

// Handle user logout
const logoutUser = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.refreshToken

  if (!refreshToken) {
    return res
      .status(200)
      .clearCookie("accessToken", accessCookieOptions)
      .clearCookie("refreshToken", refreshCookieOptions)
      .json(new ApiResponse(200, {}, "Logged out successfully"))
  }

  await User.findOneAndUpdate(
    { refreshToken: refreshToken },
    { $unset: { refreshToken: 1 } },
    { new: true }
  )

  return res
    .status(200)
    .clearCookie("accessToken", accessCookieOptions)
    .clearCookie("refreshToken", refreshCookieOptions)
    .json(new ApiResponse(200, {}, "User logged out"))
})

// Refreshes the access token using a valid refresh token.
const refreshAccessToken = asyncHandler(async (req, res) => {

  const incomingRefreshToken = req.cookies?.refreshToken || req.body.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "Unauthorized request - refresh token required")
  }

  // JWT verification with error handling 
  let decodedToken;

  try {
    decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET)
  } catch (error) {
    throw new ApiError(401, error.message)
  }

  // Validate decoded token payload
  if (!decodedToken?._id) {
    throw new ApiError(401, "Invalid token payload");
  }

  const user = await User.findById(decodedToken?._id)

  if (!user) {
    throw new ApiError(401, "Invalid refresh token: user not found")
  }

  // Check if the refresh token matches the one stored in database
  if (incomingRefreshToken !== user?.refreshToken) {
    throw new ApiError(401, "Refresh token is expired or used")
  }

  // Generate new tokens
  const { refreshToken, accessToken } = await generateAccessAndRefreshTokens(user);

  console.log(`Access token refreshed for user: ${user._id}`);

  return res
    .status(200)
    .cookie("accessToken", accessToken, accessCookieOptions)
    .cookie("refreshToken", refreshToken, refreshCookieOptions)
    .json(new ApiResponse(
      200,
      { accessToken, refreshToken },
      "Access token refreshed successfully"
    ))
})

// Handle change user password
const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;


  if (!oldPassword?.trim()) {
    throw new ApiError(400, "Old password is required")
  }

  if (!newPassword?.trim()) {
    throw new ApiError(400, "Old password is required")
  }

  const user = await User.findById(req.user?._id)

  if (!user) {
    throw new ApiError(404, "User not found")
  }

  const isCorrectPassword = await user.isPasswordCorrect(oldPassword)

  if (!isCorrectPassword) {
    throw new ApiError(400, 'Invalid old password');
  }

  user.password = newPassword
  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, 'Password changed successfully'))

})

// Fetches the current authenticated user
const getCurrentUser = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(new ApiResponse(200, req.user, 'Current user fetched successfully'))

})

// Updates the authenticated user's account details
const updateAccountDetails = asyncHandler(async (req, res) => {
  const { fullName, email } = req.body;

  if (!fullName || !email) {
    throw new ApiError(400, 'All fields are required');
  }

  const existingUser = await User.findOne({ email, _id: { $ne: req.user._id } });

  if (existingUser) {
    throw new ApiError(409, "User with this email already exists")
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        fullName,
        email
      }
    },
    { new: true }
  ).select("-password -refreshToken")

  return res
    .status(200)
    .json(new ApiResponse(200, user, 'Account details updated successfully'))

})

// Controller for updating avatar
const updateUserAvatar = asyncHandler(async (req, res) => {
  const avatarLocalPath = req.file?.path;

  if (!avatarLocalPath) {
    throw new ApiError(400, 'Avatar file is missing')
  }

  const response = await deleteFromCloudinary({
    public_id: req.user.avatar_publicId,
    resource_type: 'image'
  })

  const avatar = await uploadOnCloudinary(avatarLocalPath);

  if (!avatar.secure_url) {
    throw new ApiError(400, 'Avatar file is missing')
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        avatar: avatar.secure_url,
        avatar_publicId: avatar.public_id
      }
    },
    { new: true }
  ).select("-password -refreshToken")


  return res
    .status(200)
    .json(new ApiResponse(200, user, 'Avatar update successfully'))

})

// Controller for updating cover image
const updateUserCoverImage = asyncHandler(async (req, res) => {
  const coverImageLocalPath = req?.file.path;

  if (!coverImageLocalPath) {
    throw new ApiError(400, 'Cover image file is missing')
  }

  if (req.user && req.user.coverImage !== '') {
    const response = await deleteFromCloudinary({
      public_id: req.user.coverImage_publicId,
      resource_type: 'image'
    })
  }

  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!coverImage.secure_url) {
    throw new ApiError(400, 'Cover image is missing')
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        coverImage: coverImage.secure_url,
        coverImage_publicId: coverImage.public_id
      }
    },
    { new: true }
  ).select("-password -refreshToken")

  return res
    .status(200)
    .json(new ApiResponse(200, user, 'Cover image update successfully'))

})

// Fetches user channel info, subscriber counts, and subscription status.
const getUserChannelInfo = asyncHandler(async (req, res) => {

  const { userId } = req.params;

  if (!isValidObjectId(userId)) {
    throw new ApiError(400, 'Invalid user id')
  }

  const channel = await User.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(userId)
      }
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "channel",
        as: "subscribers"
      }
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "subscriber",
        as: "subscribedTo"
      }
    },
    {
      $addFields: {
        subscribersCount: {
          $size: "$subscribers"
        },
        channelsSubscribedToCount: {
          $size: "$subscribedTo"
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
        subscribersCount: 1,
        channelsSubscribedToCount: 1,
        isSubscribed: 1,
        avatar: 1,
        coverImage: 1,
        email: 1,
        createdAt: 1
      }
    }
  ])

  if (!channel?.length) {
    throw new ApiError(404, 'channel does not exists')
  }

  return res
    .status(200)
    .json(new ApiResponse(200, channel[0], 'User channel fetched'))

})

// // Fetch user's watch history with video details and owner information

const getWatchHistory = asyncHandler(async (req, res) => {
  const { limit, page } = req.query
  const aggregationPipeline = [
    {
      $match: {
        _id: new mongoose.Types.ObjectId(req.user._id),
      },
    },
    {
      $unwind: "$watchHistory",
    },
    {
      $lookup: {
        from: "videos",
        localField: "watchHistory.videos",
        foreignField: "_id",
        as: "videos",
        pipeline: [
          {
            $lookup: {
              from: "users",
              localField: "owner",
              foreignField: "_id",
              as: "owner",
              pipeline: [
                {
                  $project: {
                    username: 1,
                    fullName: 1,
                    avatar: 1,
                  },
                },
              ],
            },
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
            },
          },
        ],
      },
    },
    {
      $project: {
        date: "$watchHistory.date",
        videos: 1,
      },
    },
    {
      $group: {
        _id: "$date",
        videos: { $push: "$videos" },
      },
    },
    {
      $project: {
        date: "$_id",
        videos: { $arrayElemAt: ["$videos", 0] },
      },
    },
    {
      $sort: { date: -1 },
    },
  ];

  // Create the aggregate object
  const aggregate = User.aggregate(aggregationPipeline);

  const watchHistory = await User.aggregatePaginate(aggregate, {
    limit: parseInt(limit) || 3,
    page: parseInt(page) || 1,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, watchHistory, "Watch history fetched successfully"));
});


const clearWatchHistory = asyncHandler(async (req, res) => {
  const userId = req?.user._id
  const user = await User.findByIdAndUpdate(
    userId,
    { watchHistory: [] },
    { new: true }
  )

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  return res
    .status(200)
    .json(new ApiResponse(200, user.watchHistory, 'Watch history cleared successfully.'))
})


const searchChannels = asyncHandler(async (req, res) => {
  const { query } = req.query

  if (!query?.trim()) {
    throw new ApiError(400, "Search query cannot be empty")
  }

  const channels = await User.aggregate([
    {
      $search: {
        index: "default",
        compound: {
          should: [
            {
              autocomplete: {
                path: "fullName",
                query: query,
                fuzzy: { maxEdits: 1 }
              }
            },
            {
              text: {
                path: "username",
                query: query
              }
            }
          ],
          minimumShouldMatch: 1
        }
      }
    },
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
        subscribersCount: 1,
        isSubscribed: 1,
        avatar: 1,
        email: 1,
        createdAt: 1
      }
    }
  ]);


  return res
    .status(200)
    .json(new ApiResponse(200, channels, "Channels fetched successfully"))
})

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
  getUserChannelInfo,
  getWatchHistory,
  clearWatchHistory,
  searchChannels
}
