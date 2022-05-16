# webpp

A lightweight preprocessor for web projects

# Features

- [ ] Auto compiling .sass, .scss & .ts
- [X] Add npm modules, frameworks and stylesheets to your page with a simple syntax
- [X] Bundle all your files into one stylesheet, script and html file
- [X] Don't ever worry about waiting for the DOM to load again
- [ ] Use babel to transpile your code
- [ ] Use browserify to bundle your code
- [X] Don't link your stylesheets and scripts to your html, they are already included
- [ ] Use components in your HTML
- [ ] Automatically remove style attributes from your html and bundle them into a single file
- [X] Bundle your inline stylesheets and scripts into a single file

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
