import mongoose, { Schema } from 'mongoose'

const likeSchema = new Schema({
  comment: {
    type: Schema.Types.ObjectId,
    ref: "Comment"
  },
  video: {
    type: Schema.Types.ObjectId,
    ref: "Video"
  },
  likedBy: {
    type: Schema.Types.ObjectId,
    ref: "User"
  },
  tweet: {
    type: Schema.Types.ObjectId,
    ref: "Tweet"
  },
  tweetDeleted: Date
}, { timestamps: true })

// TTL index - expires immediately when tweetDeleted is set
likeSchema.index({ "tweetDeleted": 1 }, { expireAfterSeconds: 0 })

export const Like = mongoose.model("Like", likeSchema)