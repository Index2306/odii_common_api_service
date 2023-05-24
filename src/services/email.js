/* eslint-disable no-unused-vars */
const sgMail = require('@sendgrid/mail')
const moment = require('moment')

const {
    sendgridApiKey,
    APP_NAME,
    SELLER_URL,
    SUPPLIER_URL,
    ADMIN_URL,
} = require('../config')
const { ACC_TYPE } = require('../constants')
const Tenant = require('../models/tenant')
const AppError = require('../utils/app-error')
const {
    getActiveToken,
    getForgotPasswordToken,
    getIntiveUserToPartnerToken,
} = require('../utils/auth.util')

const EMAIL_SUPPORT = 'support@odii.vn'
const TEL_SUPPORT = '0907.711.888'
const UNSUBCRIBE_GROUP = 16603

const { getSiteUrl } = require('../utils/common.util')

sgMail.setApiKey(sendgridApiKey)

const msg_sample = {
    to: 'hungth.ligosoft@gmail.com', // Change to your recipient
    from: EMAIL_SUPPORT, // Change to your verified sender
    subject: 'Sending with SendGrid is Fun',
    text: 'and easy to do anywhere, even with Node.js',
    html: '<strong>and easy to do anywhere, even with Node.js</strong>',
}

const getDomain = async (id, source) => {
    const tenant = await Tenant.getDomainByTenantId(id)
    let domain
    if (tenant) {
        switch (source) {
            case ACC_TYPE.SELLER:
                domain = tenant.seller_domain
                break
            case ACC_TYPE.SUP:
                domain = tenant.supplier_domain
                break
            case ACC_TYPE.ADMIN:
                domain = tenant.admin_domain
                break

            default:
                domain = null
        }
    }
    if (!domain) {
        throw new AppError('send_email_err', {
            message: 'Không thể thực hiện, vui lòng liên hệ hỗ trợ',
        })
    }
    return domain
}

exports.sendTxtEmail = async () =>
    sgMail
        .send(msg_sample)
        .then(() => {
            console.log('Email sent')

            return true
        })
        .catch((error) => {
            console.error(error)

            return false
        })

exports.sendTemplateEmail = async ({ to, templateId, dynamicTemplateData }) =>
    sgMail
        .send({
            to,
            from: EMAIL_SUPPORT,
            templateId,
            dynamicTemplateData: {
                app_name: APP_NAME,
                year: `${new Date().getFullYear()}`,
                ...dynamicTemplateData,
            },
            asm: {
                group_id: UNSUBCRIBE_GROUP,
                groups_to_display: [UNSUBCRIBE_GROUP],
            },
        })
        .then(() => {
            console.log('Email sent to: ', to)

            return true
        })
        .catch((error) => {
            console.error(error)

            return false
        })

exports.requireActiveUser = async ({ email, user_id, source, tenant_id }) => {
    // eslint-disable-next-line prettier/prettier
    const activeLink = `${await getDomain(tenant_id, source)}/auth/active-user?token=${getActiveToken(user_id, source, tenant_id)}&email=${email}`
    console.log(activeLink)

    return exports.sendTemplateEmail({
        to: email,
        templateId: 'd-868412ddc45f4e4ca22cabf7297be185',
        dynamicTemplateData: {
            title_txt: 'Xác nhận đăng ký ODII',
            button_title_txt: 'Vui lòng bấm ở đây',
            content_txt:
                'Xin chào<br />Bạn nhận được tin nhắn này vì chúng tôi đã nhận được đăng ký tài khoản ODII từ email của bạn. Xin vui lòng xác nhận địa chỉ email bằng cách click vào nút bấm bên dưới<br />Thao tác này giúp đảm bảo an toàn cho doanh nghiệp của bạn.',
            hyperlink: activeLink,
        },
        asm: {
            group_id: UNSUBCRIBE_GROUP,
            groups_to_display: [UNSUBCRIBE_GROUP],
        },
    })
}

exports.resetUserPassword = async ({ email, source, tenant_id }) => {
    const activeLink = `${await getDomain(tenant_id, source)}/auth/reset-password?token=${getForgotPasswordToken(email, source)}`
    return exports.sendTemplateEmail({
        to: email,
        templateId: 'd-868412ddc45f4e4ca22cabf7297be185',
        dynamicTemplateData: {
            title_txt: 'Thiết lập mật khẩu ODII',
            button_title_txt: 'Đặt lại mật khẩu',
            content_txt: `Chúng tôi đã nhận được yêu cầu thiết lập lại mật khẩu của bạn.<br />
                Xin vui lòng ấn vào nút bấm bên dưới để tiến hành quá trình.<br />
                Nếu như bạn đã không yêu cầu thiết lập lại mật khẩu, xin hãy bỏ qua email này hoặc thông báo với chúng tôi.<br />
                Email này chỉ có hiệu lực trong vòng 12 giờ từ khi gửi đi.`,
            hyperlink: activeLink,
        },
        asm: {
            group_id: UNSUBCRIBE_GROUP,
            groups_to_display: [UNSUBCRIBE_GROUP],
        },
    })
}

exports.inviteUserToPartner = async ({
    email,
    full_name,
    phone,
    user,
    role_ids,
    store_ids,
    source,
    source_ids,
}) => {
    const link = `${await getDomain(user.tenant_id, source)}/verify/invitation?token=${getIntiveUserToPartnerToken(
        email,
        full_name,
        phone,
        user.partner_id,
        user.id,
        role_ids,
        store_ids,
        source,
        source_ids,
        user.tenant_id,
    )}`
    console.log(1, link)

    return exports.sendTemplateEmail({
        to: email,
        templateId: 'd-868412ddc45f4e4ca22cabf7297be185',
        dynamicTemplateData: {
            title_txt: 'Thư mời tham gia nhóm',
            button_title_txt: 'Đồng ý gia nhập',
            content_txt: `Xin chào, ${user.full_name || user.email || ''
                } có lời mời bạn gia nhập team trên nền tảng ODII. Click vào nút bấm bên dưới để đồng ý gia nhập hoặc bỏ qua`,
            hyperlink: link,
        },
        asm: {
            group_id: UNSUBCRIBE_GROUP,
            groups_to_display: [UNSUBCRIBE_GROUP],
        },
    })
}

exports.welcomePlatform = async ({ email, source }) =>
    exports.sendTemplateEmail({
        to: email,
        templateId: 'd-06e8070c60c54b1e8624151db8889560',
        dynamicTemplateData: {
            title_txt: 'Chào mừng bạn đã đến với ODII!',
            button_title_txt: 'Đi tới hệ thống Bán hàng',
            content_txt: `ODII xin chân thành cảm ơn bạn đã lựa chọn chúng tôi làm đối tác trong hành trình kinh doanh sắp tới. Hãy bắt đầu lựa chọn sản phẩm kinh doanh ngay hôm nay!`,
            hyperlink: `${getSiteUrl(source || SELLER_URL)}/dashboard`,
            content_txt2: `Mọi vấn đề liên quan đến thông tin hoặc cần trợ giúp xin liên hệ qua email ${EMAIL_SUPPORT} hoặc tổng đài 24/7 ${TEL_SUPPORT} để được hỗ trợ và giải đáp. Đội ngũ tư vấn của ODII luôn vui lòng được phục vụ bạn.`,
        },
        asm: {
            group_id: UNSUBCRIBE_GROUP,
            groups_to_display: [UNSUBCRIBE_GROUP],
        },
    })

exports.welcomeSupplier = async ({ email, source, tenant_id }) =>
    exports.sendTemplateEmail({
        to: email,
        templateId: 'd-06e8070c60c54b1e8624151db8889560',
        dynamicTemplateData: {
            title_txt: 'Chào mừng bạn đã đến với ODII!',
            button_title_txt: 'Đi tới hệ thống Supplier',
            content_txt: `ODII xin chân thành cảm ơn bạn đã lựa chọn chúng tôi làm đối tác trong hành trình kinh doanh sắp tới. Hãy bắt đầu lựa chọn sản phẩm kinh doanh ngay hôm nay!`,
            hyperlink: `${await getDomain(tenant_id, source)}/dashboard`,
            content_txt2: `Mọi vấn đề liên quan đến thông tin hoặc cần trợ giúp xin liên hệ qua email ${EMAIL_SUPPORT} hoặc tổng đài 24/7 ${TEL_SUPPORT} để được hỗ trợ và giải đáp. Đội ngũ tư vấn của ODII luôn vui lòng được phục vụ bạn.`,
        },
        asm: {
            group_id: UNSUBCRIBE_GROUP,
            groups_to_display: [UNSUBCRIBE_GROUP],
        },
    })
exports.registerSupplierError = async ({ email, note, source, tenant_id }) =>
    exports.sendTemplateEmail({
        to: email,
        templateId: 'd-06e8070c60c54b1e8624151db8889560',
        dynamicTemplateData: {
            title_txt: 'Xác thực tài khoản ODII chưa thành công!',
            button_title_txt: 'Đi tới hệ thống Supplier',
            content_txt: `ODII xin chân thành cảm ơn bạn đã đăng kí làm nhà cung cấp, tuy nhiên dữ liệu bạn chưa đủ. Lí do : ${note} `,
            hyperlink: `${await getDomain(tenant_id, source)}/dashboard`,
            content_txt2: `Mọi vấn đề liên quan đến thông tin hoặc cần trợ giúp xin liên hệ qua email ${EMAIL_SUPPORT} hoặc tổng đài 24/7 ${TEL_SUPPORT} để được hỗ trợ và giải đáp. Đội ngũ tư vấn của ODII luôn vui lòng được phục vụ bạn.`,
        },
        asm: {
            group_id: UNSUBCRIBE_GROUP,
            groups_to_display: [UNSUBCRIBE_GROUP],
        },
    })
exports.TransactionFailed = async ({ email, transaction, note, source }) =>
    exports.sendTemplateEmail({
        to: email,
        templateId: 'd-06e8070c60c54b1e8624151db8889560',
        dynamicTemplateData: {
            title_txt: `Giao dịch với mã code ${transaction.short_code} `,
            button_title_txt: 'Đi tới chi tiết giao dịch',
            content_txt: `Lí do từ chối : ${note}`,
            hyperlink: `${source}/transcations/${transaction.id}`,
            content_txt2: `Mọi vấn đề liên quan đến thông tin hoặc cần trợ giúp xin liên hệ qua email ${EMAIL_SUPPORT} hoặc tổng đài 24/7 ${TEL_SUPPORT} để được hỗ trợ và giải đáp.Đội ngũ tư vấn của ODII luôn vui lòng được phục vụ bạn.`,
        },
        asm: {
            group_id: UNSUBCRIBE_GROUP,
            groups_to_display: [UNSUBCRIBE_GROUP],
        },
    })
exports.welcomeConnectStore = async ({ email, name, source, tenant_id }) =>
    exports.sendTemplateEmail({
        to: email,
        templateId: 'd-06e8070c60c54b1e8624151db8889560',
        dynamicTemplateData: {
            title_txt: 'Chào mừng bạn đã đến với ODII!',
            button_title_txt: 'Đi tới hệ thống Seller',
            content_txt: `Tài khoản đã kết nối với store ${name}  thành công. Hãy bắt đầu lựa chọn sản phẩm kinh doanh ngay hôm nay!`,
            hyperlink: `${await getDomain(tenant_id, source)}/dashboard`,
            content_txt2: `Mọi vấn đề liên quan đến thông tin hoặc cần trợ giúp xin liên hệ qua email ${EMAIL_SUPPORT} hoặc tổng đài 24/7 ${TEL_SUPPORT} để được hỗ trợ và giải đáp.Đội ngũ tư vấn của ODII luôn vui lòng được phục vụ bạn.`,
        },
        asm: {
            group_id: UNSUBCRIBE_GROUP,
            groups_to_display: [UNSUBCRIBE_GROUP],
        },
    })
exports.welcomePlatformWithAccountInfo = async ({ email, password, source, tenant_id }) =>
    exports.sendTemplateEmail({
        to: email,
        templateId: 'd-06e8070c60c54b1e8624151db8889560',
        dynamicTemplateData: {
            title_txt: 'Chào mừng bạn đến với ODII',
            button_title_txt: 'Đi tới hệ thống',
            content_txt: `Chúng tôi rất vui mừng được hỗ trợ bạn trong hành trình kinh doanh sắp tới. Để tiếp tục quy trình đăng ký, xin vui lòng ấn vào đường dẫn dưới đây:`,
            hyperlink: `${await getDomain(tenant_id, source)}/dashboard`,
            content_txt2: `Thông tin tài khoản của bạn:<br /> - Email: ${email}<br /> - Password: <span>${password}</span>`,
        },
        asm: {
            group_id: UNSUBCRIBE_GROUP,
            groups_to_display: [UNSUBCRIBE_GROUP],
        },
    })

exports.loginNotify = async ({ user, email }) =>
    exports.sendTemplateEmail({
        to: email,
        templateId: 'd-868412ddc45f4e4ca22cabf7297be185',
        dynamicTemplateData: {
            user,
        },
        asm: {
            group_id: UNSUBCRIBE_GROUP,
            groups_to_display: [UNSUBCRIBE_GROUP],
        },
    })

exports.TransactionNotify = async ({ email, transaction, status, note }) => {
    transaction.amount = Math.abs(transaction.amount).toLocaleString('vi-VN', {
        style: 'currency',
        currency: 'VND',
    })
    exports.sendTemplateEmail({
        to: email,
        templateId: 'd-0e915eba3903403eae235be76b169423',
        dynamicTemplateData: {
            total_amount: transaction.amount,
            service_name: 'Ngân hàng',
            source: 'Chuyển khoản',
            created_at: moment
                .utc(transaction.created_at)
                .local()
                .format('HH:mm:ss DD-MM-YYYY'),
            transaction_code: transaction.short_code,
            amount: transaction.amount.toLocaleString('vi-VN', {
                style: 'currency',
                currency: 'VND',
            }),
            surcharge: '0',
        },
        asm: {
            group_id: UNSUBCRIBE_GROUP,
            groups_to_display: [UNSUBCRIBE_GROUP],
        },
    })
}
exports.requireExportData = async ({ email, link }) =>
    exports.sendTemplateEmail({
        to: email,
        templateId: 'd-868412ddc45f4e4ca22cabf7297be185',
        dynamicTemplateData: {
            title_txt: 'Xác nhận xuất dữ liệu ODII',
            button_title_txt: 'Tải dữ liệu ngay',
            content_txt:
                'Xin chào<br />Bạn nhận được tin nhắn này vì chúng tôi đã nhận được yêu cầu xuất dữ liệu tài khoản ODII từ email của bạn. Xin vui lòng click vào link bên dưới để tải về <br />Thao tác này giúp đảm bảo an toàn cho doanh nghiệp của bạn.',
            hyperlink: link,
        },
        asm: {
            group_id: UNSUBCRIBE_GROUP,
            groups_to_display: [UNSUBCRIBE_GROUP],
        },
    })

exports.adminInviteStaff = async ({ email, password, source, tenant_id }) =>
    exports.sendTemplateEmail({
        to: email,
        templateId: 'd-06e8070c60c54b1e8624151db8889560',
        dynamicTemplateData: {
            title_txt: 'Chào mừng bạn đến với ODII',
            button_title_txt: 'Đi tới hệ thống Admin',
            content_txt: `Chúng tôi rất vui mừng mời bạn vào hệ thống quản trị của Odii. Để tiếp tục, xin vui lòng đăng nhập :`,
            hyperlink: `${await getDomain(tenant_id, source)}/auth/signin`,
            content_txt2: `Thông tin tài khoản của bạn:<br /> - Email: ${email}<br /> - Password: <span>${password}</span>`,
        },
        asm: {
            group_id: UNSUBCRIBE_GROUP,
            groups_to_display: [UNSUBCRIBE_GROUP],
        },
    })

exports.adminInviteTenant = async ({ email, password, domain }) =>
    exports.sendTemplateEmail({
        to: email,
        templateId: 'd-06e8070c60c54b1e8624151db8889560',
        dynamicTemplateData: {
            title_txt: 'Chào mừng bạn đến với ODII',
            button_title_txt: 'Đi tới hệ thống Admin',
            content_txt: `Chúng tôi rất vui mừng mời bạn vào hệ thống quản trị của Odii. Để tiếp tục, xin vui lòng đăng nhập :`,
            hyperlink: `${domain}/auth/signin`,
            content_txt2: `Thông tin tài khoản của bạn:<br /> - Email: ${email}<br /> - Password: <span>${password}</span>`,
        },
        asm: {
            group_id: UNSUBCRIBE_GROUP,
            groups_to_display: [UNSUBCRIBE_GROUP],
        },
    })

