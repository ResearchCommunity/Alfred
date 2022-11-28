const Eris = require('eris')

const config = require('../config')

const client = new Eris.CommandClient(config.token, {
    intents: ["guilds", "guildMessages"]
})

client.editStatus(config.presence.status, config.presence.activities)

client.connect()
    .then(() => {
        console.log('Successfully logged in!')
    })
    .catch(err => {
        console.error('Unable to log in. Please check the bot token.\nMessage from Discord: ' + err.message)
        process.exit()
    })