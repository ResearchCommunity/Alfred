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

const { ChannelType, ApplicationCommandType, PermissionFlagsBits } = require('discord.js')
const mongo = require('../mongo')

// Passed to Discord when registering the command
// https://discord.com/developers/docs/interactions/application-commands#application-command-object
module.exports.info = {
    name: 'threadwatch',
    description: 'Toggle automatic un-archival for a thread',
    type: ApplicationCommandType.ChatInput,
    default_member_permissions: PermissionFlagsBits.ManageThreads.toString()
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