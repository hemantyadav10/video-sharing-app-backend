import mongoose from "mongoose";

const searchHistorySchema = new mongoose.Schema({
  searches: [
    {
      type: String,
      required: true,
    }
  ],
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  }
}, { timestamps: true })

export const SearchHistory = mongoose.model("SearchHistory", searchHistorySchema)
