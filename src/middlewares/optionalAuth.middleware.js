import jwt from "jsonwebtoken";
import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/user.model.js";

export const optionalAuth = asyncHandler(async (req, _res, next) => {
  const token =
    req.cookies?.accessToken ||
    req.header("Authorization")?.replace("Bearer", "").trim();

  if (!token) {
    // No token, proceed as unauthenticated
    return next();
  }

  try {
    // Verify the token
    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET)

    // Fetch the user by ID
    const user = await User.findById(decodedToken?._id).select("_id");

    // Attach user to request if found
    if (user) {
      req.user = user;
    }

    next();
  } catch (error) {
    // Fail silently with req.user unset
    next();
  }
})