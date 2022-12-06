// Copyright (C) 2022  Xenorio
// See license in /LICENSE

const config = require('../../config')
const fs = require('fs')
const { Routes } = require('discord-api-types/v9')

module.exports = async(client) => {

    client.user.setPresence(config.presence)

    console.log('Ready to rumble!')

    loadCommands(client)

    require('../music/player').play()
    require('../api/server').start(client, config.api.port)

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
    client.rest.put(
        Routes.applicationGuildCommands(client.user.id, config.guild), { body: commands },
    );

}