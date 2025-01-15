import jwt from "jsonwebtoken";
import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/apiError.js";

export const optionalAuth = asyncHandler(async (req, res, next) => {
  const token = req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer", "").trim();

  if (!token) {
    return next();
  }

  let decodedToken;

  try {
    decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET)
  } catch (error) {
    throw new ApiError(401, error.message, error)
  }

  const user = await User.findById(decodedToken?._id).select("_id");

  if (!user) {
    throw new ApiError(401, "Invalid Access Token")
  }

  req.user = user;
  next();

})