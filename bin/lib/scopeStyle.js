module.exports = /**
 * It takes a CSS string and an ID, and returns a new CSS string with the ID prefixed
 * to every selector
 * @param css - The CSS to be scoped.
 * @param id - The id of the element you want to scope the CSS to.
 * @returns the css with the id added to the selector.
 */
function scopeStyle(css, id) {
    css = css.replace(/([^\s]*)\s*{/g, (match, selector) => {
        // Add the prefix to the selector
        selector = `#${id} ${selector} {`

        return selector
    })

    return css
}