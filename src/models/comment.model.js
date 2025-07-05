import mongoose, { Schema } from 'mongoose'
import mongooseAggregatePaginate from 'mongoose-aggregate-paginate-v2'

const commentSchema = new Schema({
  content: {
    type: String,
    required: true
  },
  video: {
    type: Schema.Types.ObjectId,
    ref: "Video"
  },
  owner: {
    type: Schema.Types.ObjectId,
    ref: "User"
  },
  parentId: {
    type: Schema.Types.ObjectId,
    ref: "Comment",
    default: null
  },
  isPinned: {
    type: Boolean,
    default: false
  },
  isEdited: {
    type: Boolean,
    default: false
  }
}, { timestamps: true })


commentSchema.plugin(mongooseAggregatePaginate)

commentSchema.index({ video: 1, isPinned: 1 });

export const Comment = mongoose.model("Comment", commentSchema)