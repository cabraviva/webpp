const fs = require('fs')
const path = require('path')

async function isWebppFolder(filepath, webppFolders) {
    const stat = await fs.promises.stat(filepath)
    if (stat.isDirectory()) {
        if (filepath.endsWith('.webpp')) {
            webppFolders.push(filepath)
        }

        let $webppFolders = await getWebppFolders(filepath)
        for (const $webppFolder of $webppFolders) {
            await isWebppFolder($webppFolder, webppFolders)
        }
    }
}

async function getWebppFolders(projectdir) {
    const webppFolders = []
    const files = await fs.promises.readdir(projectdir)
    for (const file of files) {
        const filepath = path.join(projectdir, file)
        await isWebppFolder(filepath, webppFolders)
    }
    return webppFolders
}

module.exports = {
    getWebppFolders,
    isWebppFolder
}