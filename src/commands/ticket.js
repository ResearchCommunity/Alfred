// Copyright (C) 2022  Xenorio
// See license in /LICENSE

const { ComponentType, ApplicationCommandType, PermissionFlagsBits } = require('discord.js')

// Passed to Discord when registering the command
// https://discord.com/developers/docs/interactions/application-commands#application-command-object
module.exports.info = {
    name: 'ticket',
    description: 'Admin command for ticket related matters',
    type: ApplicationCommandType.ChatInput,
    default_member_permissions: PermissionFlagsBits.Administrator.toString()
}

// Called whenever the command is being executed
module.exports.execute = async(client, interaction) => {
    interaction.reply({
        content: 'What do you want to do?',
        ephemeral: true,
        components: [{
            type: ComponentType.ActionRow,
            components: [{
                type: ComponentType.StringSelect,
                custom_id: 'ticket-menu',
                options: [{
                    label: 'Creation Message',
                    description: 'Send a ticket creation message in this channel',
                    value: 'ticket-creation-message'
                }]
            }]
        }]
    })
}