// Copyright(C) 2022 Marcus Huber (xenorio) 
// <dev@xenorio.xyz>

// This program is free software: you can redistribute it and / or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
// See the GNU Affero General Public License for more details.

// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
// ######################################################################### //

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