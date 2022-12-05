// Copyright (C) 2022  Xenorio
// See license in /LICENSE

const { IntentsBitField, Client } = require('discord.js')
const { REST } = require('@discordjs/rest')
const fs = require('fs')

const config = require('../config')

let intents = new IntentsBitField()

intents.add(
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildVoiceStates,
    IntentsBitField.Flags.GuildMembers
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