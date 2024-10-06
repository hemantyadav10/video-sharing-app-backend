import { v2 as cloudinary } from "cloudinary";
import fs from 'fs'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});


// Function to upload file to cloudinary
const uploadOnCloudinary = async (localFilePath) => {
  try {
    if (!localFilePath) throw new Error('No file path provided');

    //upload file on cloudinary
    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: "auto",
    })

    //file uploaded successfully
    console.log('file uploaded on cloudinary', response)
    fs.unlinkSync(localFilePath);


    return response;

  } catch (error) {
    // Delete the file in case of error
    fs.unlinkSync(localFilePath);
    console.error('Error during Cloudinary upload:', error);
    return null;
  }
}

export { uploadOnCloudinary }