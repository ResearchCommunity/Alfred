// Copyright (C) 2022  Xenorio
// See license in /LICENSE

const Eris = require('eris')
const fs = require('fs')

const config = require('../config')

const client = new Eris.CommandClient(config.keys.discord, {
    intents: ["guilds", "guildMessages"]
})

loadEvents()
require('./mongo') // Init database

client.editStatus(config.presence.status, config.presence.activities)

client.connect()
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