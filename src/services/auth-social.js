/* eslint-disable no-unused-vars */
const _ = require('lodash')
const axios = require('axios')
const { OAuth2Client } = require('google-auth-library')
const {
    GOOGLE_CLIENT_ID,
    GOOGLE_SECRET,
    RECAPTCHA_V3_SECRET,
} = require('../config')

const oAuth2Client = new OAuth2Client(
    GOOGLE_CLIENT_ID,
    GOOGLE_SECRET,
    'postmessage'
)

exports.getFacebookUserInfo = async (token) => {
    console.log('facebook token=', token)

    return axios(`https://graph.facebook.com/v11.0/me`, {
        params: {
            fields: 'id,name,email,birthday,gender',
            access_token: token,
        },
    })
        .then(({ data }) => {
            console.log('getFacebookUserInfo =', data)
            data.avatar = `https://graph.facebook.com/v11.0/${data.id}/picture`

            return data
        })
        .catch(({ response }) => ({
            error: {
                code: _.get(response.data, 'error.code'),
                message: _.get(response.data, 'error.message'),
            },
        }))
}

/**
 * curl -i -X GET \
 "https://graph.facebook.com/v11.0/102050915479436/picture"
 */

exports.getGoogleUserInfo = async (token) => {
    console.log('getGoogleUserInfo =', token)
    const ticket = await oAuth2Client.verifyIdToken({
        idToken: token,
        audience: GOOGLE_CLIENT_ID,
    })
    const payload = ticket.getPayload()
    // const userid = payload['sub'];
    payload.avatar = payload.picture
    console.log('payload = ', payload)

    return payload
}
exports.getGoogleUserInfoV2 = async (code) => {
    console.log('getGoogleUserInfo =', code)
    const { tokens } = await oAuth2Client.getToken(code) // exchange code for tokens
    const { id_token } = tokens
    const ticket = await oAuth2Client.verifyIdToken({
        idToken: id_token,
        audience: GOOGLE_CLIENT_ID,
    })
    const payload = ticket.getPayload()
    // const userid = payload['sub'];
    payload.avatar = payload.picture
    console.log('payload = ', payload)

    return payload
}

/// RECAPTCHA_V3_SECRET
exports.verifyRecaptchaV3 = async (token, remoteip) => {
    console.log('verifyRecaptchaV3 token=', token)

    return axios('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        headers: {
            'Content-type': 'application/x-www-form-urlencoded',
        },
        data: {
            response: token,
        },
        params: {
            secret: RECAPTCHA_V3_SECRET,
            response: token,
            remoteip,
        },
    })
        .then(({ data }) => {
            console.log('verifyRecaptchaV3 =', data)
            if (data.success !== true)
                throw new Error('invalid_recaptcha_token')

            return data
        })
        .catch(({ response }) => {
            console.log('verifyRecaptchaV3 errror = ', response)
            throw new Error('invalid_recaptcha_token')
        })
}

// {
//     "success": true|false,
//     "challenge_ts": timestamp,  // timestamp of the challenge load (ISO format yyyy-MM-dd'T'HH:mm:ssZZ)
//     "hostname": string,         // the hostname of the site where the reCAPTCHA was solved
//     "error-codes": [...]        // optional
// }

// setTimeout(async () => {
//     console.log('run abc')
//     exports.verifyRecaptchaV3('sdhfhgsdj')
// }, 2000)
