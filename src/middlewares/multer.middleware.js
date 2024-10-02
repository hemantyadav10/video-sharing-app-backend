import multer from "multer";

const storage = multer.diskStorage({
  // Define the destination folder where files will be temporarily stored
  destination: function (req, file, cb) {
    cb(null, "./public/temp") // Save the file in 'public/temp' directory
  },
  // Define how the file will be named once stored
  filename: function (req, file, cb) {
    cb(null, file.originalname); 
  }
})

// Create an 'upload' middleware to handle single file uploads with specified storage configuration
export const upload = multer({ storage })