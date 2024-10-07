import { Comment } from '../models/comment.model.js';
import { ApiError } from '../utils/apiError.js'
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { isValidObjectId } from 'mongoose'
import { Video } from '../models/video.model.js';

const addComment = asyncHandler(async (req, res) => {
  const { content } = req.body

  if (!content?.trim()) {
    throw new ApiError(400, "Content is required");
  }

  const { videoId } = req.params

  if (!videoId) {
    throw new ApiError(400, "Video id is missing")
  }
  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid video id")
  }

  const video = await Video.findById(videoId);
  if (!video) {
    throw new ApiError(404, "Video does not exist");
  }

  const comment = await Comment.create({
    content: content.trim(),
    video: videoId,
    owner: req.user?._id
  })

  if (!comment) {
    throw new ApiError(500, 'Failed to add comment')
  }

  return res
    .status(200)
    .json(new ApiResponse(200, comment, 'Comment added successfully'))
})

const updateComment = asyncHandler(async (req, res) => {
  const { newComment } = req.body
  const { commentId } = req.params

  if (!newComment?.trim()) {
    throw new ApiError(400, "Content is required")
  }

  if (!commentId) {
    throw new ApiError(400, "comment id is required")
  }

  if (!isValidObjectId(commentId)) {
    throw new ApiError(400, "Invalid comment id")
  }

  const comment = await Comment.findById(commentId)

  if (!comment) {
    throw new ApiError(404, 'Comment not found')
  }

  if (!(comment.owner.equals(req.user?._id))) {
    throw new ApiError(403, "You are not authorized to update comment")
  }

  comment.content = newComment.trim();

  const updatedComment = await comment.save({validateBeforeSave: false})


  if(!updatedComment) {
    throw new ApiError(500, "Failed to update comment")
  }

  return res
    .status(200)
    .json(new ApiResponse(200, comment, 'Comment updated successfully'))

})

const deleteComment = asyncHandler(async (req, res) => {
  const { commentId } = req.params;
  if (!commentId) {
    throw new ApiError(400, "comment id is missing")
  }

  if (!isValidObjectId(commentId)) {
    throw new ApiError(400, "Invalid comment id")
  }

  const comment = await Comment.findById(commentId)

  if (!comment) {
    throw new ApiError(404, "Comment not found")
  }

  if (!comment.owner.equals(req.user?._id)) {
    throw new ApiError(403, "You are not authorized to delete this comment")
  }

  const deletedResult = await comment.deleteOne()

  if (deletedResult.deletedCount !== 1) {
    throw new ApiError(500, "Failed to delete the comment")
  }

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Comment Deleted successfully"))
})

export {
  addComment,
  deleteComment,
  updateComment
}