// Copyright (C) 2022  Xenorio
// See license in /LICENSE

// Passed to Discord when registering the command
// https://discord.com/developers/docs/interactions/application-commands#application-command-object
module.exports.info = {
    name: 'ticket',
    description: 'Admin command for ticket related matters',
    type: 1, // CHAT_INPUT
    default_member_permissions: '0'
}

// Called whenever the command is being executed
module.exports.execute = async(client, interaction) => {
    interaction.createMessage({
        content: 'What do you want to do?',
        flags: 64, // Ephemeral
        components: [{
            type: 1, // Collection
            components: [{
                type: 3, // Selection menu
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