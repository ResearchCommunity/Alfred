// Copyright (C) 2022  Xenorio
// See license in /LICENSE

const config = require('../../config')
const fs = require('fs')

module.exports = async(client) => {

    console.log('Ready to rumble!')

    loadCommands(client)

    let player

    if (config.music.emergency) {
        player = '../music/emergency-player'
    } else {
        player = '../music/player'
    }

    require(player).play()

}

function loadCommands(client) {

    // Get all file names in commands dir
    let files = fs.readdirSync('./src/commands/')

    let commands = []

    files.forEach(file => {

        // Ignore non-js files
        if (!file.endsWith('.js')) return

        // Parse command name from file name
        let name = file.split('.')[0]

        // Load command
        let command = require(`../commands/${file}`)

        // Queue command for registering
        commands.push(command.info)

    })

    // Register commands
    // Uses guild commands for immediate registering, bypassing cache
    client.bulkEditGuildCommands(config.guild, commands)

}