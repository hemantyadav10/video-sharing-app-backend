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
    fs.unlinkSync(localFilePath);


    return response;

  } catch (error) {
    // Delete the file in case of error
    fs.unlinkSync(localFilePath);
    console.error('Error during Cloudinary upload:', error);
    return null;
  }
}


const deleteFromCloudinary = async (publicId) => {
  try {
    if (!publicId) throw new Error('No file provided for deletion');

    const response = await cloudinary.uploader.destroy(publicId.public_id, {
      resource_type: publicId.resource_type
    })

    return response;

  } catch (error) {
    console.error(`Error deleting resource from Cloudinary: ${error.message}`);
    throw new Error('Some error occured while deleting resource:', error)
  }
}

export {
  uploadOnCloudinary,
  deleteFromCloudinary
}