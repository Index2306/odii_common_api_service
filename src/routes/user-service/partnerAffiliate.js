import partnerAffiliateCtl from '../../controllers/partnerAffiliate'
import affiliatePayoutCtl from '../../controllers/affiliatePayout'
import RequireRoles from '../../utils/require-permision.helper'

async function routes(fastify) {
    RequireRoles.addParseTokenHook(fastify)
    fastify.get(
        '/partner-affiliate/me',
        RequireRoles.partnerOwner(fastify),
        partnerAffiliateCtl.getPartnerAffiliateDetail
    )

    fastify.post(
        '/partner-affiliate/me/verify',
        RequireRoles.partnerOwner(fastify),
        partnerAffiliateCtl.verifyPartnerAffiliate
    )

    fastify.get(
        '/partner-affiliate/me/list-seller',
        RequireRoles.partnerOwner(fastify),
        partnerAffiliateCtl.getAffiliateOfPartner
    )

    fastify.post(
        '/partner-affiliate/update-for-maintain',
        RequireRoles.supperAdmin(fastify),
        partnerAffiliateCtl.updateAffiliateForMaintain
    )

    fastify.put(
        '/admin/partner-affiliate/update-for-percent-commission/:id',
        RequireRoles.chiefAccountant(fastify),
        partnerAffiliateCtl.adminUpdatePercentCommission
    )
    fastify.put(
        '/admin/partner-affiliate/update-for-percent-commission',
        RequireRoles.chiefAccountant(fastify),
        partnerAffiliateCtl.adminUpdateAllPercentCommission
    )

    fastify.post(
        '/partner-affiliate/generate-for-migrate',
        RequireRoles.supperAdmin(fastify),
        partnerAffiliateCtl.genPartnerAffiliateForMigrate
    )

    fastify.get(
        '/partner-affiliate/list-payout',
        RequireRoles.partnerAffiliate(fastify),
        partnerAffiliateCtl.getPayoutAffiliateListing
    )

    fastify.get(
        '/partner-affiliate/me/list-commission',
        RequireRoles.partnerOwner(fastify),
        affiliatePayoutCtl.getCommissionListing
    )

    fastify.get(
        '/partner-affiliate/exportListCommission',
        RequireRoles.partnerOwner(fastify),
        affiliatePayoutCtl.sellerExportListCommission
    )

    fastify.get(
        '/admin/partner-affiliate/list-commission-order',
        RequireRoles.accountant(fastify),
        affiliatePayoutCtl.adminGetListOder
    )

    fastify.get(
        '/admin/partner-affiliate/list-commission',
        RequireRoles.supperAdmin(fastify),
        affiliatePayoutCtl.getCommissionListing
    )

    fastify.get(
        '/admin/affiliate-periods',
        RequireRoles.accountant(fastify),
        affiliatePayoutCtl.adminGetCommissionListing
    )

    fastify.get(
        '/admin/statistical-affiliate-periods',
        RequireRoles.accountant(fastify),
        affiliatePayoutCtl.adminGetStatisticalCommission
    )

    fastify.get(
        '/statistical-affiliate-periods',
        RequireRoles.partnerOwner(fastify),
        affiliatePayoutCtl.getStatisticalCommission
    )

    fastify.put(
        '/admin/affiliate-periods/:id',
        RequireRoles.accountant(fastify),
        affiliatePayoutCtl.adminUpdateCommission
    )

    fastify.get(
        '/admin/affiliate-periods/:id',
        RequireRoles.accountant(fastify),
        affiliatePayoutCtl.adminGetDetailCommission
    )
    fastify.get(
        '/admin/export-affiliate-periods',
        RequireRoles.accountant(fastify),
        affiliatePayoutCtl.adminExportAffPeriods
    )
    fastify.get(
        '/admin/partner-affiliate',
        RequireRoles.accountant(fastify),
        partnerAffiliateCtl.adminGetListPartnerAff
    )
    fastify.get(
        '/admin/export-list-commission-order',
        RequireRoles.supperAdmin(fastify),
        affiliatePayoutCtl.adminExportListCommissionOrder
    )
}

module.exports = routes
