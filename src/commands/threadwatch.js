// Copyright (C) 2022  Xenorio
// See license in /LICENSE

const { ChannelType, ApplicationCommandType, PermissionFlagsBits } = require('discord.js')
const mongo = require('../mongo')

// Passed to Discord when registering the command
// https://discord.com/developers/docs/interactions/application-commands#application-command-object
module.exports.info = {
    name: 'threadwatch',
    description: 'Toggle automatic un-archival for a thread',
    type: ApplicationCommandType.ChatInput,
    default_member_permissions: PermissionFlagsBits.Administrator.toString()
}

// Called whenever the command is being executed
module.exports.execute = async (client, interaction) => {
    
    if (interaction.channel.type != ChannelType.PublicThread) return interaction.reply({
        ephemeral: true,
        content: 'This is not a thread!'
    })

    let data = await mongo.queryOne('Threads', { id: interaction.channel.id })
    
    if (!data) {
        data = {
            id: interaction.channel.id,
            watched: false
        }
        await mongo.insert('Threads', data)
    }

    await mongo.update('Threads', { id: interaction.channel.id }, { watched: !data.watched })
    
    interaction.reply({
        ephemeral: true,
        content: `Thread watching has been ${!data.watched ? 'enabled' : 'disabled'}!`
    })

}