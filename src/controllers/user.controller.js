import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/apiError.js'
import { ApiResponse } from '../utils/ApiResponse.js'
import { User } from '../models/user.model.js'
import { uploadOnCloudinary } from '../utils/cloudinary.js'
import jwt from 'jsonwebtoken'

// Generate and store access and refresh tokens for the user
const generateAccessAndRefreshTokens = async (user) => {
  try {
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken }

  } catch (error) {
    throw new ApiError('something went wrong while generating refresh/access token:', error)
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
    fullName,
    avatar: avatar.url,
    coverImage: coverImage?.url || "",
    email,
    password,
    username: username.toLowerCase()
  })

  // Fetch and return created user, excluding password and refreshToken
  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  )

  if (!createdUser) {
    throw new ApiError(500, 'Something went wrong while registering the user')
  }

  return res.status(201).json(
    new ApiResponse(200, createdUser, "User registered successfully")
  )

})

// Handle user login
const loginUser = asyncHandler(async (req, res) => {
  const { username, email, password } = req.body;

  if (!username && !email) {
    throw new ApiError(400, "username or email is required");
  }

  if (!password) {
    throw new ApiError(400, "password is required");
  }

  const user = await User.findOne({
    $or: [{ username }, { email }]
  })

  if (!user) {
    throw new ApiError(404, "username or email doesnot exist")
  }

  const isPasswordValid = await user.isPasswordCorrect(password);

  if (!isPasswordValid) {
    throw new ApiError(401, 'Invalid credentials')
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user);

  const loggedInUser = await User.findById(user._id).select("-password -refreshToken");

  const options = {
    httpOnly: true,
    secure: true
  }

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(new ApiResponse(
      200,
      {
        user: loggedInUser,
        accessToken,
        refreshToken
      },
      "User logged in successfully"
    ))

})

// Handle user logout
const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    { $set: { refreshToken: undefined } },
    { new: true }
  )

  const options = {
    httpOnly: true,
    secure: true
  }

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(204, {}, "User logged out"))
})

// Refreshes the access token using a valid refresh token.
const refreshAccessToken = asyncHandler(async (req, res) => {

  const incomingRefreshToken = req.cookies?.refreshToken || req.body.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "unauthorized request")
  }

  const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET)

  const user = await User.findById(decodedToken?._id)

  if (!user) {
    throw new ApiError(401, "Invalid refresh token")
  }

  if (incomingRefreshToken !== user?.refreshToken) {
    throw new ApiError(401, "Refresh token is expired or used")
  }

  const { refreshToken, accessToken } = await generateAccessAndRefreshTokens(user);

  const options = {
    httpOnly: true,
    secure: true
  }

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(new ApiResponse(
      200,
      {
        accessToken,
        refreshToken
      },
      "Access token refreshed"
    ))
})

// Handle change user password
const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body();

  const user = await User.findById(req.user?._id)

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

  const avatar = await uploadOnCloudinary(avatarLocalPath);

  if (!avatar.url) {
    throw new ApiError(400, 'Avatar file is missing')
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        avatar: avatar.url
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
  const coverImageLocalPath = req.file?.path;

  if (!coverImageLocalPath) {
    throw new ApiError(400, 'Cover image file is missing')
  }

  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!coverImage.url) {
    throw new ApiError(400, 'Cover image is missing')
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        coverImage: coverImage.url
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

  const { username } = req.params;

  if (!username?.trim()) {
    throw new ApiError(400, 'username is missing');
  }

  const channel = await User.aggregate([
    {
      $match: {
        username: username.toLowerCase()
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
        email: 1
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
  getUserChannelInfo
}