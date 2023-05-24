const { _, isEmpty } = require('lodash')
const { useMyTrx } = require('../connections/pg-general')
const { createAdmin } = require('./user')
const Tenant = require('../models/tenant')
const User = require('../models/user')
const Order = require('../models/order')
const SupplierWareHousing = require('../models/supplierWareHousing')
const { ACC_TYPE } = require('../constants')

exports.createTenant = async (data) => {
    const tenant_id = await useMyTrx(null, async (trx) => {
        const [tenantId] = await Tenant.insertTenant(data, { trx })

        const value = {
            ...data,
            tenant_id: tenantId,
            source: 'admin',
        }

        await createAdmin(value)

        return tenantId
    })

    return { tenant_id }
}

exports.createSubscription = async (data) => {
    const { crm_tenant_id, ...value } = data
    const subscription_id = await useMyTrx(null, async (trx) => {
        const [subscriptionId] = await Tenant.insertSupcription(value, { trx })

        await Tenant.insertTenantTransaction({
            name: value.name,
            rule: value.rule,
            durationByDay: value.durationByDay,
            subscription_id: subscriptionId,
            note: `Kích hoạt gói ${value.name}`,
        }, { trx })

        await Tenant.updateTenantById(value.tenant_id, { status: 'active' }, { trx })

        return subscriptionId
    })

    return { subscription_id }
}

exports.updateSubscription = async (data) => {
    const { subscription, crm_subscription_id, ...value } = data
    const updatedData = await useMyTrx(null, async (trx) => {
        const dataUpdate = await Tenant.updateSubscriptionById(subscription.id, value)

        if (value.rule?.maxSeller !== subscription.rule?.maxSeller ||
            value.rule?.maxSupplier !== subscription.rule?.maxSupplier ||
            value.rule?.maxStock !== subscription.rule?.maxStock ||
            value.rule?.maxOrder !== subscription.rule?.maxOrder
        ) {
            if (value.rule?.maxSeller - subscription.rule?.maxSeller < 0) {
                await User.updateUser(
                    { tenant_id: subscription.tenant_id, account_type: ACC_TYPE.SELLER },
                    {
                        status: 'inactive'
                    },
                    { trx }
                )
                await Tenant.insertTenantTransaction({
                    name: subscription.name,
                    subscription_id: subscription.id,
                    note: `Giảm hạn mức gói, đã dựng hoạt động tất cả seller. Vui lòng kích hoạt lại các tài khoản seller ưu tiên`,
                }, { trx })
            }

            if (value.rule?.maxSupplier - subscription.rule?.maxSupplier < 0 ||
                value.rule?.maxStock - subscription.rule?.maxStock < 0) {
                await User.updateUser(
                    { tenant_id: subscription.tenant_id, account_type: ACC_TYPE.SUP },
                    {
                        status: 'inactive'
                    },
                    { trx }
                )
                await SupplierWareHousing.updateSupplierWareHousing(
                    { tenant_id: subscription.tenant_id },
                    {
                        status: 'inactive',
                    },
                    { trx }
                )
                await Tenant.insertTenantTransaction({
                    name: subscription.name,
                    subscription_id: subscription.id,
                    note: `Giảm hạn mức gói, đã dựng hoạt động tất cả supplier. Vui lòng kích hoạt lại các tài khoản supplier ưu tiên`,
                }, { trx })
            }
            if (value.name !== subscription.name) {
                await Tenant.insertTenantTransaction({
                    ...value,
                    subscription_id: subscription.id,
                    note: `Kích hoạt gói ${value.name}`,
                }, { trx })
            } else {
                await Tenant.insertTenantTransaction({
                    ...value,
                    subscription_id: subscription.id,
                    note: 'Thay đổi hạn mức',
                }, { trx })
            }
        } else if (value.status === 'inactive') {
            await Tenant.insertTenantTransaction({
                name: subscription.name,
                subscription_id: subscription.id,
                note: `Gói ${subscription.name} đã hết hạn`,
            }, { trx })
        } else if (value.durationByDay > subscription.durationByDay) {
            await Tenant.insertTenantTransaction({
                name: subscription.name,
                subscription_id: subscription.id,
                durationByDay: value.durationByDay,
                note: `Gia han thêm gói ${subscription.name}`,
            }, { trx })
        }

        return dataUpdate
    })

    return updatedData
}

exports.cancelSubscription = async (subscription) => {
    const is_success = await useMyTrx(null, async (trx) => {
        await Tenant.deleteSubscriptionById(subscription.id, { trx })
        await Tenant.insertTenantTransaction({
            name: subscription.name,
            rule: subscription.rule,
            subscription_id: subscription.id,
            durationByDay: subscription.durationByDay,
            note: `Đã xóa gói ${subscription.name}`
        }, { trx })

        return true
    })

    return is_success
}


exports.getStatsSubscription = async (tenant_id) => {
    const dataSeller = await User.getAllUsers({
        account_type: 'seller',
        is_deleted: false,
        status: 'active',
        tenant_id: tenant_id,
    })

    const dataSup = await User.getAllUsers({
        account_type: 'supplier',
        is_deleted: false,
        status: 'active',
        tenant_id: tenant_id,
    })

    const dataOrder = await Order.getOrders({
        is_deleted: false,
        is_map: true,
        tenant_id: tenant_id,
    })

    const dataStock = await SupplierWareHousing.getAllSupplierWareHousing({
        tenant_id: tenant_id,
        status: 'active',
    })

    return {
        totalSeller: dataSeller.length,
        totalSupplier: dataSup.length,
        totalOrder: dataOrder.length,
        totalStock: dataStock.length,
    }
}