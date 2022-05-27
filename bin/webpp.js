#! /usr/bin/env node

const chalk = require('chalk')
const compile = require('./lib/compile')
const path = require('path')
const chokidar = require('chokidar')

const args = process.argv.slice(2)
const command = (args[0] || '').trim()
const argv = args.slice(1)
const argStr = argv.join(' ').trim() + ' '

async function useWatcher (firstCompileCallback = () => {}) {
    const argvString = argv.join(' ').trim()
    const projectdir = path.isAbsolute(argvString) ? path.normalize(argvString) : path.normalize(path.join(process.cwd(), path.normalize(argvString)))

    let isFirstCompilation = true

    const watcher = chokidar.watch(projectdir, {
        ignored: /(^|[\/\\])\../,
        persistent: true
    })

    watcher.on('ready', () => {
        console.log(chalk.cyan('Watching for changes...'))
    })

    watcher.on('change', async (path) => {
        // Return if file doesn't include '.webpp'
        if (!path.includes('.webpp')) return

        await compile(argvString, { dev: true }, [path])

        if (isFirstCompilation) {
            isFirstCompilation = false
            firstCompileCallback()
        }
    })

    watcher.on('unlink', async (path) => {
        // Return if file doesn't include '.webpp'
        if (!path.includes('.webpp')) return

        await compile(argvString, { dev: true }, [path])

        if (isFirstCompilation) {
            isFirstCompilation = false
            firstCompileCallback()
        }
    })

    watcher.on('add', async (path) => {
        // Return if file doesn't include '.webpp'
        if (!path.includes('.webpp')) return

        await compile(argvString, { dev: true }, [path])

        if (isFirstCompilation) {
            isFirstCompilation = false
            firstCompileCallback()
        }
    })

    watcher.on('error', (error) => {
        console.log(chalk.red('Error: ' + error))
    })

    process.on('SIGINT', () => {
        watcher.close()
        process.exit()
    })

    process.on('SIGTERM', () => {
        watcher.close()
        process.exit()
    })

    process.on('exit', () => {
        watcher.close()
    })

    process.on('uncaughtException', (error) => {
        console.log(chalk.red('Error: ' + error))
    })
}

function useDevServer () {
    const argvString = argv.join(' ').trim()
    const projectdir = path.isAbsolute(argvString) ? path.normalize(argvString) : path.normalize(path.join(process.cwd(), path.normalize(argvString)))

    const express = require('express')

    const app = express()

    const port = 489 + Math.floor(Math.random() * 1000)

    app.use(express.static(projectdir))

    app.listen(port, () => {
        const open = require('open')
        open(`http://localhost:${port}`)
    })
}

;(async function main () {
  if (command === '') {
    const { version } = require('../package.json')
    console.log(chalk.cyan(`webpp ${version}`))
    console.log(chalk.cyan('Use webpp help for more information'))
  } else if (command === 'help') {
    console.log(chalk.cyan('Welcome to webpp - a lightweight preprocessor for web projects'))
    console.log(chalk.cyan('Usage: ' + chalk.yellow('webpp [command] [options]')))
    console.log('')

    console.log(chalk.cyan('Commands:'))
    // help
    console.log(chalk.yellow('  help') + ' - ' + chalk.gray('Show this help message'))
    // watch
    console.log(chalk.yellow('  watch') + ' - ' + chalk.gray('Watch for changes and run webpp'))
    // compile
    console.log(chalk.yellow('  compile') + ' - ' + chalk.gray('Compile the project'))
  } else if (command === 'compile' || command === 'c' || command === 'build' || command === 'b' || command === 'run' || command === 'r' || command === '.') {
    // deepcode ignore ExpectsArray: It will work though
    await compile(argv.join(' ').trim(), { dev: false }, '*')
  } else if (command === 'watch' || command === 'w') {
    useWatcher()
  } else if (command === 'dev' || command === 'serve' || command === 'd') {
    useWatcher(useDevServer)
  } else {
    console.log(chalk.red('Unknown command: ' + command))
    console.log(chalk.red('Try: ' + chalk.yellow('webpp help')))
  }
})()

module.exports = {
    compile
}