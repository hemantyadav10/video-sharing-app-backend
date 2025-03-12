import { SearchHistory } from "../models/searchHistory.model.js"
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/apiError.js";


const getUserSearchHistory = asyncHandler(async (req, res) => {
  const userId = req?.user._id

  const history = await SearchHistory.findOne({ user: userId });

  return res
    .status(200)
    .json(new ApiResponse(200, history, "Search history fetched successfully."))
})


const setSearchHistory = asyncHandler(async (req, res) => {
  const { searchTerm } = req.body;
  const lowerCaseSearchTerm = searchTerm?.toLowerCase();
  const userId = req?.user._id;

  if (!lowerCaseSearchTerm) {
    throw new ApiError(400, "Search term is required")
  }

  let history = await SearchHistory.findOne({ user: userId });

  if (!history) {
    history = await SearchHistory.create({
      user: userId,
      searches: [lowerCaseSearchTerm]
    })
  } else {
    history.searches = history.searches.filter(term => term.toLowerCase() !== lowerCaseSearchTerm);

    history.searches.unshift(lowerCaseSearchTerm);

    if (history.searches.length > 15) {
      history.searches = history.searches.slice(0, 15);
    }

    await history.save();
  }

  return res
    .status(200)
    .json(new ApiResponse(201, history, "Search history updated"));
})


const clearSearchHistory = asyncHandler(async (req, res) => {
  const userId = req?.user._id

  await SearchHistory.findOneAndDelete({
    user: userId
  })

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Search history cleared successfully"))
})


const deleteSearchItem = asyncHandler(async (req, res) => {
  const userId = req?.user._id
  const { searchTerm } = req.body
  const lowerCaseSearchTerm = searchTerm?.toLowerCase();


  if (!lowerCaseSearchTerm) {
    throw new ApiError(400, "Search term is required")
  }

  const updatedHistory = await SearchHistory.findOneAndUpdate(
    { user: userId },
    { $pull: { searches: lowerCaseSearchTerm } },
    { new: true }
  )

  return res
    .status(200)
    .json(new ApiResponse(200, updatedHistory, "Search item remove successfully"))

})

export {
  getUserSearchHistory,
  setSearchHistory,
  clearSearchHistory,
  deleteSearchItem
}