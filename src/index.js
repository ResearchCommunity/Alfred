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

const { IntentsBitField, Client } = require('discord.js')
const { REST } = require('@discordjs/rest')
const fs = require('fs')

const config = require('../config')

let intents = new IntentsBitField()

intents.add(
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildVoiceStates,
    IntentsBitField.Flags.GuildMembers,
	IntentsBitField.Flags.GuildMessages,
	IntentsBitField.Flags.MessageContent
)

const client = new Client({
    intents: intents
})

client.rest = new REST({ version: '9' }).setToken(config.keys.discord);

loadEvents()
require('./mongo') // Init database

client.login(config.keys.discord)
    .then(() => {
        console.log('Successfully logged in!')
    })
    .catch(err => {
        console.error('Unable to log in. Please check the bot token.\nMessage from Discord: ' + err.message)
        process.exit()
    })


function loadEvents() {

    // Get all file names in events dir
    let files = fs.readdirSync('./src/events/')

    files.forEach(file => {

        // Ignore non-js files
        if (!file.endsWith('.js')) return

        // Parse event name from file name
        let name = file.split('.')[0]

        // Load event
        let event = require(`./events/${file}`)

        // Bind event
        client.on(name, event.bind(null, client))

    })

}

module.exports = {
    client
}