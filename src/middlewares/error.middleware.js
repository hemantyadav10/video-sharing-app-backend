const globalErrorHandler = (err, req, res, next) => {
  // Log errors for debugging purpose
  console.log(err)

  // Default error details
  const statusCode = err.statusCode || 500
  const message = err.message || 'Something went wrong'
  const success = false
  const errors = err.errors || []

  // Send structured JSON response 
  return res
    .status(statusCode)
    .json({
      success,
      message,
      statusCode,
      errors
    })
}

export { globalErrorHandler }