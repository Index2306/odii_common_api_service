const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')
const passwordComplexity = require('joi-password-complexity')
const generator = require('generate-password')
const {
    JWT_ACCESS_SECRET,
    JWT_REFRESH_SECRET,
    JWT_ACCESS_LIFETIME,
    JWT_REFRESH_LIFETIME,
    JWT_ALL_SECRET,
} = require('../config')

// support "h" only, ex 72h
exports.getTokenExpTime = (days) => {
    const number = parseInt(days.replace(/[^0-9\.]/g, ''))

    // const tmp = days.includes('h') ? number * 60 : number
    let expTime = number
    if (days.includes('m')) expTime = number * 1
    if (days.includes('h')) expTime = number * 60
    if (days.includes('d')) expTime = number * 60 * 24
    if (days.includes('w')) expTime = number * 60 * 24 * 7

    return new Date().getTime() + expTime * 60 * 1000
}

exports.validPassword = () =>
    passwordComplexity({
        min: 8,
        max: 50,
        lowerCase: 1,
        upperCase: 1,
        numeric: 1,
        symbol: 1,
        requirementCount: 5,
    })

exports.passwordGenerator = () =>
    `odii@${generator.generate({
        length: 10,
        numbers: true,
        symbols: false,
        lowercase: true,
        uppercase: true,
        strict: true,
    })}`

/**
 * FORGOT PASSWORD
 */
exports.getForgotPasswordToken = (email, source) =>
    jwt.sign(
        {
            email,
            source,
        },
        JWT_ALL_SECRET,
        { expiresIn: '24h' }
    )

exports.verifyForgotPasswordToken = (token) => {
    try {
        return jwt.verify(token, JWT_ALL_SECRET)
    } catch (error) {
        console.log('err verifyForgotPasswordToken :', error.message)

        return undefined
    }
}

/**
 * INVITE USER
 */
exports.getIntiveUserToPartnerToken = (
    email,
    full_name,
    phone,
    partner_id,
    owner_user_id,
    role_ids,
    store_ids,
    source,
    source_ids,
    tenant_id,
) =>
    jwt.sign(
        {
            email,
            full_name,
            phone,
            partner_id,
            owner_user_id,
            role_ids,
            store_ids,
            source,
            source_ids,
            tenant_id,
        },
        JWT_ALL_SECRET,
        { expiresIn: '24h' }
    )

exports.verifyIntiveUserToPartnerToken = (token) => {
    try {
        return jwt.verify(token, JWT_ALL_SECRET)
    } catch (error) {
        console.log('err verifyIntiveUserToPartnerToken :', error.message)

        return undefined
    }
}

exports.getUserToken = (
    user_id,
    expiresIn,
    secret = JWT_ACCESS_SECRET,
    source,
    tenant_id
) =>
    jwt.sign(
        {
            id: user_id,
            source,
            tenant_id,
        },
        secret,
        { expiresIn }
    )

exports.getUserAccessToken = (user_id, source, tenant_id) =>
    exports.getUserToken(
        user_id,
        JWT_ACCESS_LIFETIME,
        JWT_ACCESS_SECRET,
        source,
        tenant_id
    )

exports.getUserRefreshToken = (user_id, source, tenant_id) =>
    exports.getUserToken(
        user_id,
        JWT_REFRESH_LIFETIME,
        JWT_REFRESH_SECRET,
        source,
        tenant_id
    )

exports.getActiveToken = (user_id, source, tenant_id) => exports.getUserToken(user_id, '24h', JWT_ACCESS_SECRET, source, tenant_id)

exports.verifyToken = (token, secret = JWT_ACCESS_SECRET) => {
    try {
        return jwt.verify(token, secret)
    } catch (error) {
        console.log('err verifyToken :', error.message)

        return undefined
    }
}

exports.verifyTokenDetail = (token, secret = JWT_ACCESS_SECRET) => {
    try {
        const data = jwt.verify(token, secret)

        return {
            is_success: true,
            data,
        }
    } catch (error) {
        return {
            is_success: false,
            error_code: 'token_expired',
        }
    }
}

exports.verifyAccessToken = (token) => exports.verifyToken(token)

exports.verifyRefreshToken = (token) =>
    exports.verifyToken(token, JWT_REFRESH_SECRET)

exports.comparePassword = async (planePw, hashedPw) =>
    bcrypt.compare(planePw, hashedPw)

exports.hashPassword = (password) => bcrypt.hash(password, 10)

exports.getUserTokenFull = (user_id, source, tenant_id) => ({
    access_token: exports.getUserAccessToken(user_id, source, tenant_id),
    refresh_token: exports.getUserRefreshToken(user_id, source, tenant_id),
    access_token_exp: exports.getTokenExpTime(JWT_ACCESS_LIFETIME),
    refresh_token_exp: exports.getTokenExpTime(JWT_REFRESH_LIFETIME),
})
