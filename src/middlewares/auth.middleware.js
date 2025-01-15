import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/apiError.js'
import jwt from 'jsonwebtoken'
import { User } from '../models/user.model.js';

export const verifyJWT = asyncHandler(async (req, _res, next) => {
  // Extract token from cookies or Authorization header
  const token = req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer", "").trim();

  if (!token) {
    throw new ApiError(401, "Unauthorized request")
  }

  let decodedToken;

  // Verify the JWT token
  try {
    decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET)
  } catch (error) {
    throw new ApiError(401, error.message, error)
  }

  // Find the user associated with the token
  const user = await User.findById(decodedToken?._id).select("-password -refreshToken")

  if (!user) {
    throw new ApiError(401, "Invalid Access Token")
  }

  req.user = user;
  next();

})