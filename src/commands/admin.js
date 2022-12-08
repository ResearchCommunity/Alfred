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

const { ComponentType, ApplicationCommandType, PermissionFlagsBits } = require('discord.js')

// Passed to Discord when registering the command
// https://discord.com/developers/docs/interactions/application-commands#application-command-object
module.exports.info = {
    name: 'admin',
    description: 'Admin Actions',
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
                custom_id: 'admin-menu',
                options: [{
                        label: 'Ticket Message',
                        description: 'Send a ticket creation message in this channel',
                        value: 'ticket-creation-message'
                    },
                    {
                        label: 'Rule Message',
                        description: 'Send a rule message in this channel',
                        value: 'rule-message'
                    }
                ]
            }]
        }]
    })
}