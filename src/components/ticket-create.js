// Copyright (C) 2022  Xenorio
// See license in /LICENSE

const config = require('../../config')
const { Constants } = require('eris')
const mongo = require('../mongo')

module.exports.execute = async(client, interaction) => {

    let guild = client.guilds.get(config.guild)

    let existing = await mongo.queryOne('Tickets', { user: interaction.member.id })

    if (existing && guild.channels.get(existing.channel)) {
        interaction.createMessage({
            flags: 64, // Ephemeral
            content: `You already have a tripsitting channel at <#${existing.channel}>!`
        })
        return
    } else if (existing) {
        mongo.delete('Tickets', existing)
    }

    let channel = await guild.createChannel(interaction.member.nick || interaction.member.username, 0, {
        parentID: config.tickets.category,
        permissionOverwrites: [{
                id: guild.id,
                deny: Constants.Permissions.viewChannel
            },
            {
                id: interaction.member.id,
                type: 1,
                allow: Constants.Permissions.viewChannel + Constants.Permissions.sendMessages
            },
            {
                id: client.user.id,
                type: 1,
                allow: Constants.Permissions.viewChannel + Constants.Permissions.sendMessages + Constants.Permissions.manageChannels
            },
            {
                id: config.tickets.tripsitter,
                allow: Constants.Permissions.viewChannel + Constants.Permissions.sendMessages
            }
        ]
    })

    channel.createMessage({
        content: `<@${interaction.member.id}> <@&${config.tickets.tripsitter}>\nHere's your private tripsitting channel!`,
        components: [{
            type: 1, // Collection
            components: [{
                type: 2, // Button
                style: 4, // Blue
                custom_id: 'ticket-delete',
                label: '🗑️ Delete'
            }]
        }]
    })

    interaction.createMessage({
        flags: 64, // Ephemeral
        content: `Your private tripsitting channel has been created at <#${channel.id}>!`
    })

    mongo.insert('Tickets', {
        channel: channel.id,
        user: interaction.member.id
    })

}