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
const mongo = require('../mongo')
const { ChannelType, ComponentType, ButtonStyle, OverwriteType } = require('discord.js')

module.exports.execute = async(client, interaction) => {

    let guild = client.guilds.resolve(config.guild)
    let category = guild.channels.resolve(config.tickets.category)

    let existing = await mongo.queryOne('Tickets', { user: interaction.member.id })

    if (existing && guild.channels.resolve(existing.channel)) {
        interaction.reply({
            ephemeral: true,
            content: `You already have a tripsitting channel at <#${existing.channel}>!`
        })
        return
    } else if (existing) {
        mongo.delete('Tickets', existing)
    }

    let channel = await category.children.create({
        name: interaction.member.displayName,
        type: ChannelType.GuildText,
        parentID: config.tickets.category,
        permissionOverwrites: [{
                id: guild.id,
                type: OverwriteType.Role,
                deny: 'ViewChannel'
            },
            {
                id: interaction.member.id,
                type: OverwriteType.Member,
                allow: [
                    'ViewChannel',
                    'SendMessages'
                ]
            },
            {
                id: client.user.id,
                type: OverwriteType.Member,
                allow: [
                    'ViewChannel',
                    'SendMessages',
                    'ManageChannels'
                ]
            },
            {
                id: config.tickets.tripsitter,
                type: OverwriteType.Role,
                allow: [
                    'ViewChannel',
                    'SendMessages'
                ]
            }
        ]
    })

    channel.send({
        content: `<@${interaction.member.id}> <@&${config.tickets.tripsitter}>\nHere's your private tripsitting channel!`,
        components: [{
            type: ComponentType.ActionRow,
            components: [{
                type: ComponentType.Button,
                style: ButtonStyle.Danger,
                custom_id: 'ticket-delete',
                label: '🗑️ Delete'
            }]
        }]
    })

    interaction.reply({
        ephemeral: true,
        content: `Your private tripsitting channel has been created at <#${channel.id}>!`
    })

    mongo.insert('Tickets', {
        channel: channel.id,
        user: interaction.member.id
    })

}