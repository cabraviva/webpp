const fs = require('fs')
const path = require('path')
const axios = require('axios')

module.exports = async function cachify(dir, cname, url) {
    const fetchIt = async function fetchIt() {
        return (await axios.get(url)).data
    }

    // First, try to load from RAM
    if (!global.cached) global.cached = {}
    if (global.cached[cname]) return global.cached[cname]

    // Else, try to read from the fs or fetch it
    let needsFetch = false
    if (!fs.existsSync(path.join(dir, cname))) needsFetch = true
    if (!fs.existsSync(path.join(dir, `${cname}.time`))) needsFetch = true

    if (!needsFetch) {
        const time = (await fs.promises.readFile(path.join(dir, `${cname}.time`))).toString()
        const timeStamp = new Date(time)

        // If the timestamp is older than 1 day, fetch the registry
        if (new Date().getTime() - timeStamp.getTime() > 86400000) {
            const fetched = await fetchIt()
            // deepcode ignore PT: We can trust the registry to be valid
            fs.writeFileSync(path.join(dir, cname), JSON.stringify(fetched))
            fs.writeFileSync(path.join(dir, `${cname}.time`), (new Date()).toISOString())
            global.cached[cname] = fetched
            return fetched
        }

        const read = JSON.parse(fs.readFileSync(path.join(dir, cname)).toString('utf8'))
        global.cached[cname] = read
        return read
    } else {
        const fetched = await fetchIt()
        // deepcode ignore PT: We can trust the registry to be valid
        fs.writeFileSync(path.join(dir, cname), JSON.stringify(fetched))
        fs.writeFileSync(path.join(dir, `${cname}.time`), (new Date()).toISOString())
        global.cached[cname] = fetched
        return fetched
    }
}