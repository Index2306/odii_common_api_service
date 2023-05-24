exports.parseOption = (query) => {
    const option = {
        page: query?.page * 1 || 1,
        page_size: query?.page_size * 1 || 20,
        paginate: {
            perPage: query?.page_size * 1 || 20,
            currentPage: query?.page * 1 || 1,
            isLengthAware: true,
        },
        order_by: query?.order_by,
        order_direction: query?.order_direction || 'desc',
    }
    if (query) {
        delete query?.page
        delete query?.page_size
        delete query?.order_by
        delete query?.order_direction
    }

    return option
}
