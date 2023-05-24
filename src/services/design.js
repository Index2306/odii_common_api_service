const _ = require('lodash')
const Template = require('../models/template')
const { STATUS } = require('../constants')
const Design = require('../models/design')
const { knex } = require('../connections/pg-general')

exports.createTemplate = async (user, { designs, ...value }) => {
    const result = await knex.transaction(async (trx) => {
        const [templateId] = await Template.insertTemplate(value, { trx })

        if (!templateId) throw new Error('create_template_fail')

        if (designs) {
            const designsData = designs.map((design) => {
                design.artwork_template_id = templateId
                design.partner_id = user.partner_id
                design.status = STATUS.ACTIVE
                design.display_status = STATUS.ACTIVE
                if (!_.isEmpty(design.layers))
                    design.layers = JSON.stringify(design.layers)
                else design.layers = '[]'

                return design
            })

            await Design.insertDesign(designsData, { trx })

            return {
                template_id: templateId,
                designs: designsData,
            }
        }
    })

    return result
}

exports.updateTemplate = async (user, { designs, id, ...body }) => {
    const result = await knex.transaction(async (trx) => {
        if (designs) {
            const designsData = designs.map((design) => {
                design.artwork_template_id = id
                design.partner_id = user.partner_id
                design.status = STATUS.ACTIVE
                design.display_status = STATUS.ACTIVE
                if (!_.isEmpty(design.layers))
                    design.layers = JSON.stringify(design.layers)
                else design.layers = '[]'

                return design
            })
            console.log(6, designsData)

            await Design.upsertDesign(designsData, { trx })
        }

        await Template.updateTemplateById(id, body, {
            trx,
        })

        return {
            id,
        }
    })

    return result
}
