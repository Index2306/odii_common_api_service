const UserCtl = require('../../controllers/user')
const AuthCtl = require('../../controllers/auth')
const RoleCtl = require('../../controllers/role')
const ProductSourceCtl = require('../../controllers/products/product-source')

const NotificationCtl = require('../../controllers/notification')

const RequireRoles = require('../../utils/require-permision.helper')

async function routes(fastify) {
    RequireRoles.addParseTokenHook(fastify)

    fastify.post('/users/me/change-password', AuthCtl.changePassword)
    fastify.post(
        '/users/me/seller-invite-to-partner',
        AuthCtl.sellerInviteUserToPartner
    )
    fastify.post(
        '/users/me/supplier-invite-to-partner',
        AuthCtl.supplierInviteUserToPartner
    )
    fastify.post(
        '/users/me/update-notify-player-id',
        NotificationCtl.subscribeWebpush
    )
    fastify.put(
        '/users/me/update-roles-for-staff',
        RequireRoles.partnerUser(fastify),
        RoleCtl.updateRolesForUser
    )
    fastify.put(
        '/users/me/update-status-for-staff',
        RequireRoles.partnerUser(fastify),
        RoleCtl.updateStatusForStaff
    )
    fastify.get(
        '/users/me/partner',
        // RequireRoles.partnerUser(fastify),
        RequireRoles.partnerMember(fastify),
        UserCtl.getUserPartner
    )
    fastify.get(
        '/users/me/partner/:id',
        // RequireRoles.partnerUser(fastify),
        RequireRoles.partnerMember(fastify),
        UserCtl.getUserPartnerDetail
    )
    fastify.get('/users/me/profile', UserCtl.getUserProfile)
    fastify.put('/admin/min_limit_amount', UserCtl.updateMinLimitAmount)
    fastify.put('/users/me/profile', UserCtl.updateUser)
    fastify.put('/users/me/setting', UserCtl.updateUserSetting)
    fastify.put('/users/me/webpush-token', UserCtl.updateUserWebpushToken)
    fastify.get(
        '/admin/users',
        RequireRoles.adminUser(fastify),
        UserCtl.adminGetUsers
    )
    fastify.put(
        '/admin/users/:user_id/profile',
        RequireRoles.adminUser(fastify),
        UserCtl.adminUpdateUser
    )
    fastify.put(
        '/admin/users/:supplier_id/approve-supplier',
        RequireRoles.adminUser(fastify),
        UserCtl.adminSetUserBecomeSupplier
    )
    fastify.put(
        '/admin/users/:supplier_id/inactive-supplier',
        RequireRoles.adminUser(fastify),
        UserCtl.adminSetInactiveSupplier
    )

    fastify.put(
        '/admin/users/update-roles',
        RequireRoles.adminUser(fastify),
        RoleCtl.adminUpdateRolesForUser
    )
    fastify.get(
        '/admin/users/:id',
        RequireRoles.adminUser(fastify),
        UserCtl.getUserDetail
    )
    fastify.get(
        '/accountant/users/:id',
        RequireRoles.accountant(fastify),
        UserCtl.getUserDetail
    )
    fastify.get(
        '/accountant/partner/users/:id',
        RequireRoles.partnerBalance(fastify),
        UserCtl.getUserDetail
    )
    fastify.get(
        '/seller/users/me/stores',
        // RequireRoles.partnerOwner(fastify),
        UserCtl.getUserListStore
    )
    fastify.get(
        '/supplier/product/source',
        RequireRoles.partnerMember(fastify),
        ProductSourceCtl.getProductSources
    )
    fastify.post(
        '/admin/user',
        RequireRoles.adminUser(fastify),
        UserCtl.adminCreateUser
    )
    fastify.post(
        '/users/me/supplier-remove-staff',
        RequireRoles.partnerOwner(fastify),
        AuthCtl.supplierRemoveStaff
    )
    fastify.post(
        '/users/me/seller-remove-staff',
        RequireRoles.partnerOwner(fastify),
        AuthCtl.sellerRemoveStaff
    )
}

module.exports = routes
