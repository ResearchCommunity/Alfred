// Copyright (C) 2022  Xenorio
// See license in /LICENSE

// Passed to Discord when registering the command
// https://discord.com/developers/docs/interactions/application-commands#application-command-object
module.exports.info = {
    name: 'ping',
    description: '🏓',
    type: 1, // CHAT_INPUT
}

// Called whenever the command is being executed
module.exports.execute = async(client, interaction) => {
    interaction.createMessage('Pong 🏓')
}