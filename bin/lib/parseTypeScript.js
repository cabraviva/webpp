const babel = require('@babel/core')

module.exports = function parseTypeScript(tsCode, fname, cwd) {
    return babel.transformSync(tsCode, {
        presets: [
            '@babel/preset-typescript'
        ],
        filename: fname,
        cwd
    }).code
}