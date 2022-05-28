# webpp

A lightweight preprocessor for web projects

# Features

- [X] Auto compiling .sass, .scss
- [X] Use TypeScript
- [X] Add npm modules, frameworks and stylesheets to your page with a simple syntax
- [X] Bundle all your files into one stylesheet, script and html file
- [X] Don't ever worry about waiting for the DOM to load again
- [X] Use babel to transpile your code
- [ ] Use browserify to bundle your code
- [X] Don't link your stylesheets and scripts to your html, they are already included
- [X] Use components in your HTML
- [X] Bundle your inline stylesheets and scripts into a single file
- [ ] Use react like reactivity
- [X] Use @event in your HTML to listen to events
- [ ] Caching System for super speed builds
- [X] Super fast dev builds & slow, but ultra compatible production builds
- [X] Live Reloading in Dev Mode

# Why webpp?
I created webpp because I wanted:
- Components to be used in my HTML
- That normal HTML is valid in webpp
- To use SASS
- To only write the body of the HTML
- To bundle all my inline code into one file
- To use frameworks without having to include them in every html file
- To use event listeners in my HTML instead of defining them in the JS
- To create static websites
- Super fast dev builds (maximum of 500ms)

# Project Structure

The project structure is like a normal web project, but instead of having a html file you have an .webpp folder.

For example:
In vanilla:

```
my-cool-website/
├── index.html
├── stylesheet1.css
├── script1.js
├── about.html
├── about.css
```

In webpp:

```
my-cool-website/
├── index.webpp/
│   ├── .yaml
│   ├── index.html
│   ├── style.css
│   ├── script.js
├── about.webpp/
│   ├── .yaml
│   ├── index.html
│   ├── style.css
````
