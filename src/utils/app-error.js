class AppError extends Error {
    constructor(errorCode, { message } = {}) {
        super(errorCode)
        this.name = 'AppError'
        this.errorMessage = message
    }
}

module.exports = AppError
