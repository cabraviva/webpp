function parseProps(propsStr) {
    propsStr = propsStr.trim()

    const HELPER = '__WHITESPACE_HELPER_FROM_WEBPP_TO_MAKE_SURE_THAT_THERE_ARE_NO_SPACES__HASH_VALUE_______GZuiokjuhzugds8uIJHUzsu8i9djiuiUZij4hu$IJUHjiehuikajhujaikju____'

    // PROPS FORMAT: key="value" key2="value2" key3='value3'

    propsStr = propsStr.replace(/"(.*?)"/g, function (match, $inl) {
        return `"${$inl.replace(/\s/g, HELPER)}"`
    })

    propsStr = propsStr.replace(/'(.*?)'/g, function (match, $inl) {
        return `"${$inl.replace(/\s/g, HELPER)}"`
    })

    const props = {}
    const propsArr = propsStr.split(' ')
    for (const prop of propsArr) {
        const propArr = prop.split('=')
        if (propArr.length === 2) {
            props[propArr[0].trim()] = propArr[1].replace(/__WHITESPACE_HELPER_FROM_WEBPP_TO_MAKE_SURE_THAT_THERE_ARE_NO_SPACES__HASH_VALUE_______GZuiokjuhzugds8uIJHUzsu8i9djiuiUZij4hu\$IJUHjiehuikajhujaikju____/g, ' ').trim()
            props[propArr[0].trim()] = props[propArr[0].trim()].substring(1, props[propArr[0].trim()].length - 1)
        } else {
            props[propArr[0].trim()] = propArr.slice(1).join('=').replace(/__WHITESPACE_HELPER_FROM_WEBPP_TO_MAKE_SURE_THAT_THERE_ARE_NO_SPACES__HASH_VALUE_______GZuiokjuhzugds8uIJHUzsu8i9djiuiUZij4hu\$IJUHjiehuikajhujaikju____/g, ' ').trim()
            props[propArr[0].trim()] = props[propArr[0].trim()].substring(1, props[propArr[0].trim()].length - 1)
        }
    }

    return props
}

function stringifyProps(propsObj) {
    const propsArr = []
    for (const prop in propsObj) {
        propsArr.push(`${prop}="${propsObj[prop]}"`)
    }
    return propsArr.join(' ')
}

module.exports = { parseProps, stringifyProps }