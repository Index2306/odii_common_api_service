import RequireRoles from '../../utils/require-permision.helper'
import ReportCtl from '../../controllers/report'

async function routes(fastify) {
    RequireRoles.addParseTokenHook(fastify)

    fastify.get(
        '/admin/reports',
        RequireRoles.supperAdmin(fastify),
        ReportCtl.getReports
    )
    fastify.post(
        '/admin/report',
        RequireRoles.supperAdmin(fastify),
        ReportCtl.createReport
    )
    fastify.put(
        '/admin/report/:id',
        RequireRoles.supperAdmin(fastify),
        ReportCtl.updateReport
    )
    fastify.get(
        '/admin/report/:id',
        RequireRoles.supperAdmin(fastify),
        ReportCtl.getReportDetail
    )
    fastify.delete(
        '/admin/report/:id',
        RequireRoles.supperAdmin(fastify),
        ReportCtl.deleteReport
    )
    fastify.post(
        '/seller/request-to-export-report',
        RequireRoles.partnerOwner(fastify),
        ReportCtl.createRequestToExportReport
    )
    fastify.get(
        '/supplier/export-transaction',
        RequireRoles.partnerBalance(fastify),
        ReportCtl.supplierExportReport
    )
    fastify.get(
        '/accountant/export-debt',
        RequireRoles.accountant(fastify),
        ReportCtl.accountantExportDebt
    )
    fastify.get(
        '/accountant/export-transaction',
        RequireRoles.accountant(fastify),
        ReportCtl.accountantExportTransaction
    )
}

module.exports = routes
