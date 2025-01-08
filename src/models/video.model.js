import mongoose, { Schema } from 'mongoose'
import mongooseAggregatePaginate from 'mongoose-aggregate-paginate-v2'
import { categories } from '../constants.js'

const videoSchema = new Schema({
  videoFile: {
    type: String,  //cloudinary url
    required: true
  },
  thumbnail: {
    type: String, // cloudinary url
    required: true
  },
  title: {
    type: String,
    required: true,
    index: true
  },
  description: {
    type: String,
    required: true
  },
  category: {
    type: String,
    enum: categories,
    required: true,
  },
  tags: [{
    type: String,

  }],
  duration: {
    type: Number, // time by cloudinary
    required: true
  },
  views: {
    type: Number,
    default: 0
  },
  isPublished: {
    type: Boolean,
    default: false
  },
  owner: {
    type: Schema.Types.ObjectId,
    ref: "User"
  },
  video_publicId: {
    type: String,
    required: true
  },
  thumbnail_publicId: {
    type: String,
    required: true
  },

}, { timestamps: true })


videoSchema.plugin(mongooseAggregatePaginate)

export const Video = mongoose.model('Video', videoSchema)