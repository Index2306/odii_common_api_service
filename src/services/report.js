const _ = require('lodash')
const archiver = require('archiver')
const streamBuffers = require('stream-buffers')
const XLSX = require('xlsx')
const moment = require('moment')

const { uploadFileToS3 } = require('./file-library')

exports.importDataToZip = async (arrData, options = {}) => {
    const outputStreamBuffer = new streamBuffers.WritableStreamBuffer({
        initialSize: 1000 * 1024,
        incrementAmount: 1000 * 1024,
    })

    const ws = XLSX.utils.json_to_sheet(arrData)

    XLSX.utils.sheet_add_aoa(ws, options.headers)
    ws['!cols'] = options.wscols

    XLSX.utils.sheet_add_aoa(ws, options.headers)

    const wb = XLSX.utils.book_new()

    XLSX.utils.book_append_sheet(wb, ws, 'File tính')

    const xlsxBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' })

    return xlsxBuffer
}
