module.exports = function scopeStyle(css, id) {
    css = css.replace(/([^\s]*)\s*{/g, (match, selector) => {
        // Add the prefix to the selector
        selector = `#${id} ${selector} {`

        return selector
    })

    return css
}